import { apiClient } from './config';

export interface ConnectionStatusResponse {
  success: boolean;
  data: {
    google: boolean;
    notion: boolean;
    hubspot: boolean;
  };
}

export interface OAuthInitiateResponse {
  success: boolean;
  authUrl: string;
}

export interface DisconnectResponse {
  success: boolean;
  message: string;
}

export const oauthAPI = {
  /**
   * Get OAuth connection status for Google and Notion
   */
  getConnectionStatus: async (): Promise<ConnectionStatusResponse> => {
    const response = await apiClient.get<ConnectionStatusResponse>('/api/oauth/connection-status');
    return response.data;
  },

  /**
   * Initiate Google OAuth flow
   */
  initiateGoogleOAuth: async (): Promise<OAuthInitiateResponse> => {
    const response = await apiClient.get<OAuthInitiateResponse>('/api/oauth/google/initiate');
    return response.data;
  },

  /**
   * Initiate Notion OAuth flow
   */
  initiateNotionOAuth: async (): Promise<OAuthInitiateResponse> => {
    const response = await apiClient.get<OAuthInitiateResponse>('/api/oauth/notion/initiate');
    return response.data;
  },

  /**
   * Initiate HubSpot OAuth flow
   */
  initiateHubspotOAuth: async (): Promise<OAuthInitiateResponse> => {
    const response = await apiClient.get<OAuthInitiateResponse>('/api/oauth/hubspot/initiate');
    return response.data;
  },

  /**
   * Disconnect Google/Gmail
   */
  disconnectGoogle: async (): Promise<DisconnectResponse> => {
    const response = await apiClient.delete<DisconnectResponse>('/api/oauth/google/disconnect');
    return response.data;
  },

  /**
   * Disconnect Notion
   */
  disconnectNotion: async (): Promise<DisconnectResponse> => {
    const response = await apiClient.delete<DisconnectResponse>('/api/oauth/notion/disconnect');
    return response.data;
  },

  /**
   * Disconnect HubSpot
   */
  disconnectHubspot: async (): Promise<DisconnectResponse> => {
    const response = await apiClient.delete<DisconnectResponse>('/api/oauth/hubspot/disconnect');
    return response.data;
  },
};

export default oauthAPI;

