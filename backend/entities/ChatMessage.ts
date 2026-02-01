import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import type { Chat } from './Chat.ts';

// Citation type for tool references
export interface Citation {
  tool: 'notion' | 'gmail' | 'hubspot';
  title: string;
  subtitle?: string;
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: 'user' | 'assistant';

  @Column({ type: 'uuid' })
  chatId!: string;

  @Column({ type: 'jsonb', nullable: true })
  citations!: Citation[] | null;

  @ManyToOne('Chat', 'messages', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatId' })
  chat!: Relation<Chat>;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
