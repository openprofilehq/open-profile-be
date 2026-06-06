import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { Waitlist } from '../entities/waitlist.entity';

@Injectable()
export class WaitlistRepository {
  constructor(
    @InjectRepository(Waitlist)
    private readonly repository: Repository<Waitlist>,
  ) {}

  async create(email: string): Promise<Waitlist> {
    const entry = this.repository.create({ email: email.toLowerCase() });
    try {
      return await this.repository.save(entry);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code: string }).code === '23505'
      ) {
        throw new ConflictException('Email already in waitlist');
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<Waitlist | null> {
    return this.repository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async getAll(
    page: number,
    limit: number,
  ): Promise<{
    data: Waitlist[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const [data, total] = await this.repository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markEmailSent(id: string): Promise<Waitlist> {
    const entry = await this.repository.findOne({ where: { id } });
    if (!entry) throw new Error('Waitlist entry not found');
    entry.emailSent = true;
    return this.repository.save(entry);
  }

  async deleteById(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
