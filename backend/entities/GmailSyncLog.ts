import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('gmail_sync_logs')
@Unique(['userId', 'emailId'])
export class GmailSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 128 })
  emailId!: string;

  @Column({ type: 'varchar', length: 256 })
  sender!: string;

  @Column({ type: 'varchar', length: 512 })
  subject!: string;

  @Column({ type: 'timestamp with time zone' })
  receivedAt!: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
