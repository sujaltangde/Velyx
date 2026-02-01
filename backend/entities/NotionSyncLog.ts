import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('notion_sync_logs')
@Unique(['userId', 'pageId'])
export class NotionSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 128 })
  pageId!: string;

  @Column({ type: 'varchar', length: 512 })
  pageTitle!: string;

  @Column({ type: 'timestamp with time zone' })
  lastEditedTime!: Date;

  @Column({ type: 'int', default: 0 })
  chunkCount!: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
