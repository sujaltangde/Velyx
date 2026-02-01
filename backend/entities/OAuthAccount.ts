import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { User } from './User.ts';

@Entity('oauth_accounts')
@Unique(['provider', 'providerAccountId'])
export class OAuthAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne('User', 'oauthAccounts', { onDelete: 'CASCADE' })
  // Use the same FK column as the scalar `userId` field to avoid creating both
  // `user_id` and `userId`.
  @JoinColumn({ name: 'userId', referencedColumnName: 'id' })
  user!: Relation<User>;

  // FK column used by the relation above
  @Column({ type: 'uuid', name: 'userId' })
  userId!: string;

  @Column({ type: 'varchar', length: 50 })
  provider!: string; // e.g., 'google', 'notion'

  @Column({ name: 'provider_account_id', type: 'varchar', length: 255 })
  providerAccountId!: string; // unique user id from provider

  @Column({ type: 'text' })
  accessToken!: string;

  @Column({ type: 'text', nullable: true })
  refreshToken!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  tokenExpiresAt!: Date | null;

  @Column({ type: 'text' })
  scopes!: string; // e.g. 'openid email profile'

  @Column({ type: 'jsonb', nullable: true })
  rawProfile!: any | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}

