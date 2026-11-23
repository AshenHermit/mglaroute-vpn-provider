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
import { Profile } from '../profiles/profile.entity';

@Entity('anycast_scores')
@Index(['profileId', 'resolvedIp'], { unique: true })
export class AnycastScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column({ type: 'inet' })
  resolvedIp: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  score: number;

  @Column({ default: 0 })
  sampleCount: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastUpdated: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}