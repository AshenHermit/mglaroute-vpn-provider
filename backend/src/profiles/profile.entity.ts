import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Subscription } from '../subscriptions/subscription.entity';

export enum Protocol {
  VMESS = 'vmess',
  VLESS = 'vless',
  SHADOWSOCKS = 'ss',
  TROJAN = 'trojan',
}

@Entity('profiles')
@Index(['subscriptionId', 'serverId'], { unique: true })
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subscriptionId: string;

  @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: Subscription;

  @Column()
  serverId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: Protocol })
  protocol: Protocol;

  @Column()
  address: string;

  @Column({ type: 'int' })
  port: number;

  @Column({ nullable: true })
  uuid: string;

  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true })
  alterId: number;

  @Column({ nullable: true })
  security: string;

  @Column({ nullable: true })
  network: string;

  @Column({ nullable: true })
  path: string;

  @Column({ nullable: true })
  host: string;

  @Column({ nullable: true })
  tls: string;

  @Column({ nullable: true })
  sni: string;

  @Column({ nullable: true })
  alpn: string;

  @Column({ nullable: true })
  fingerprint: string;

  @Column({ nullable: true })
  flow: string;

  @Column({ type: 'jsonb', nullable: true })
  rawConfig: Record<string, any>;

  @Column({ nullable: true })
  lastLatencyMs: number;

  @Column({ nullable: true })
  lastReachable: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  anycastScore: number;

  @Column({ default: 0 })
  anycastSamples: number;

  @Column({ nullable: true })
  lastScannedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}