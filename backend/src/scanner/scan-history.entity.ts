import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Profile } from '../profiles/profile.entity';
import { OnlineService } from '../online-services/online-service.entity';

@Entity('scan_history')
@Index(['profileId', 'scannedAt'])
export class ScanHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column({ nullable: true })
  onlineServiceId: string;

  @ManyToOne(() => OnlineService, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'onlineServiceId' })
  onlineService: OnlineService;

  @Column({ nullable: true })
  latencyMs: number;

  @Column({ default: false })
  reachable: boolean;

  @Column({ nullable: true })
  error: string;

  @Column({ type: 'inet', nullable: true })
  resolvedIp: string;

  @CreateDateColumn()
  scannedAt: Date;
}