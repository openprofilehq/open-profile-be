import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class ResetPassword {
  @PrimaryColumn('uuid')
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'userId' })
  userId!: string;

  @ApiProperty({
    description: 'SHA256 selector for token lookup',
    maxLength: 64,
  })
  @Column({ type: 'varchar', length: 64, name: 'tokenSelector' })
  tokenSelector!: string;

  @ApiProperty({ description: 'Argon2 hash of the reset token' })
  @Column({ type: 'text', name: 'tokenHash' })
  tokenHash!: string;

  @ApiProperty({ default: false })
  @Column({ type: 'boolean', default: false })
  used!: boolean;

  @ApiProperty({ type: 'string', format: 'date-time' })
  @Column({ type: 'timestamp with time zone', name: 'expires_at' })
  expiresAt: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  @Column({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'created_at',
  })
  createdAt: Date;

  @BeforeInsert()
  generateId() {
    this.id = uuidv7();
  }
}
