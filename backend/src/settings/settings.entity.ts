import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('scanner_settings')
export class ScannerSettings {
  @PrimaryColumn({ default: 'singleton' })
  id: string;

  @Column({ default: 300 })
  intervalSeconds: number;

  @Column({ default: 10 })
  concurrency: number;

  @Column({ default: 5000 })
  timeoutMs: number;

  @Column({ default: 3 })
  anycastMinSamples: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.5 })
  anycastThreshold: number;

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: 5000 })
  latencyThresholdMs: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}