import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { AppDataSource } from "../../data-source";
import { OAuthAccount } from "../../entities/OAuthAccount";
import moment from "moment";

const oauthRepository = AppDataSource.getRepository(OAuthAccount);

/**
 * Refreshes the HubSpot access token using the refresh token
 */
async function refreshHubspotToken(hubspotAccount: OAuthAccount): Promise<string> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("HubSpot OAuth credentials not configured");
  }

  if (!hubspotAccount.refreshToken) {
    throw new Error("No refresh token available. User needs to re-authenticate.");
  }

  const tokenResponse = await axios.post(
    "https://api.hubapi.com/oauth/v1/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: hubspotAccount.refreshToken,
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const { access_token, refresh_token, expires_in } = tokenResponse.data;

  hubspotAccount.accessToken = access_token;
  if (refresh_token) {
    hubspotAccount.refreshToken = refresh_token;
  }
  hubspotAccount.tokenExpiresAt = moment().add(expires_in, "seconds").toDate();

  await oauthRepository.save(hubspotAccount);

  return access_token;
}

/**
 * Creates a LangChain tool for fetching HubSpot contacts
 */
export function createHubspotContactsTool(userId: string) {
  return new DynamicStructuredTool({
    name: "get_hubspot_contacts",
    description: "Fetches the list of contacts from HubSpot CRM. Use this when the user asks about contacts, customers, leads, or people in their HubSpot account. Returns contact information including names, emails, and phone numbers.",
    schema: z.object({
      limit: z.number().optional().default(100).describe("Maximum number of contacts to fetch (default: 100)"),
      search: z.string().optional().describe("Optional search term to filter contacts by name or email"),
    }),
    func: async ({ limit, search }) => {
      try {
        // Get the HubSpot OAuth credentials for this user
        const hubspotAccount = await oauthRepository.findOne({
          where: {
            userId,
            provider: "hubspot",
          },
        });

        if (!hubspotAccount) {
          return JSON.stringify({
            error: "HubSpot account not connected. Please connect your HubSpot account first.",
          });
        }

        let accessToken = hubspotAccount.accessToken;

        // Check if token is expired or about to expire (within 5 minutes)
        const now = moment();
        const expiresAt = hubspotAccount.tokenExpiresAt
          ? moment(hubspotAccount.tokenExpiresAt)
          : null;

        if (expiresAt && now.isAfter(expiresAt.subtract(5, "minutes"))) {
          accessToken = await refreshHubspotToken(hubspotAccount);
        }

        // Call HubSpot API to get contacts
        const response = await axios.get(
          "https://api.hubapi.com/crm/v3/objects/contacts",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            params: {
              limit: limit || 100,
              properties: "firstname,lastname,email,phone,company,jobtitle",
            },
          }
        );

        const contacts = response.data.results || [];

        // Format contacts for better readability
        const formattedContacts = contacts.map((contact: any) => ({
          id: contact.id,
          firstName: contact.properties.firstname || "N/A",
          lastName: contact.properties.lastname || "N/A",
          email: contact.properties.email || "N/A",
          phone: contact.properties.phone || "N/A",
          company: contact.properties.company || "N/A",
          jobTitle: contact.properties.jobtitle || "N/A",
        }));

        // Filter by search term if provided
        let filteredContacts = formattedContacts;
        if (search) {
          const searchLower = search.toLowerCase();
          filteredContacts = formattedContacts.filter(
            (contact: any) =>
              contact.firstName.toLowerCase().includes(searchLower) ||
              contact.lastName.toLowerCase().includes(searchLower) ||
              contact.email.toLowerCase().includes(searchLower) ||
              contact.company.toLowerCase().includes(searchLower)
          );
        }

        return JSON.stringify({
          total: filteredContacts.length,
          contacts: filteredContacts,
        });
      } catch (error: any) {
        // If token expired, try refreshing once
        if (error.response?.status === 401) {
          try {
            const hubspotAccount = await oauthRepository.findOne({
              where: { userId, provider: "hubspot" },
            });

            if (hubspotAccount) {
              const accessToken = await refreshHubspotToken(hubspotAccount);

              // Retry the request
              const retryResponse = await axios.get(
                "https://api.hubapi.com/crm/v3/objects/contacts",
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  params: {
                    limit: limit || 100,
                    properties: "firstname,lastname,email,phone,company,jobtitle",
                  },
                }
              );

              const contacts = retryResponse.data.results || [];
              const formattedContacts = contacts.map((contact: any) => ({
                id: contact.id,
                firstName: contact.properties.firstname || "N/A",
                lastName: contact.properties.lastname || "N/A",
                email: contact.properties.email || "N/A",
                phone: contact.properties.phone || "N/A",
                company: contact.properties.company || "N/A",
                jobTitle: contact.properties.jobtitle || "N/A",
              }));

              return JSON.stringify({
                total: formattedContacts.length,
                contacts: formattedContacts,
              });
            }
          } catch (refreshError: any) {
            return JSON.stringify({
              error: "Failed to refresh HubSpot token. Please reconnect your HubSpot account.",
            });
          }
        }

        console.error("Error fetching HubSpot contacts:", error.response?.data || error.message);
        return JSON.stringify({
          error: `Failed to fetch HubSpot contacts: ${error.message}`,
        });
      }
    },
  });
}
