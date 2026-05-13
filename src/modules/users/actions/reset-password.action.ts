import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResetPassword } from '../../auth/entities/reset-password.entity';

@Injectable()
export class ResetPasswordModelAction extends AbstractModelAction<ResetPassword> {
  constructor(
    @InjectRepository(ResetPassword)
    private readonly repo: Repository<ResetPassword>,
  ) {
    super(repo, ResetPassword);
  }

  async findBySelector(tokenSelector: string): Promise<ResetPassword | null> {
    return this.repo
      .createQueryBuilder('rp')
      .where('rp.tokenSelector = :tokenSelector', { tokenSelector })
      .getOne();
  }

  async findByValidSelector(
    tokenSelector: string,
  ): Promise<ResetPassword | null> {
    return this.repo
      .createQueryBuilder('rp')
      .where('rp.tokenSelector = :tokenSelector', { tokenSelector })
      .andWhere('rp.used = :used', { used: false })
      .andWhere('rp.expiresAt > CURRENT_TIMESTAMP')
      .getOne();
  }

  async findByUserId(userId: string): Promise<ResetPassword | null> {
    return this.repo
      .createQueryBuilder('rp')
      .where('rp.userId = :userId', { userId })
      .andWhere('rp.used = :used', { used: false })
      .andWhere('rp.expiresAt > CURRENT_TIMESTAMP')
      .orderBy('rp.createdAt', 'DESC')
      .getOne();
  }

  async markAsUsed(id: string): Promise<void> {
    await this.update({
      transactionOptions: { useTransaction: false },
      identifierOptions: { id },
      updatePayload: { used: true },
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }

  // Invalidates ALL active tokens for a user before issuing a new one
  async invalidateAllByUserId(userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(ResetPassword)
      .set({ used: true })
      .where('userId = :userId', { userId })
      .andWhere('used = :used', { used: false }) // Only touch active tokens — avoids unnecessary writes
      .execute();
  }
}
