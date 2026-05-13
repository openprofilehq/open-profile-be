import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

type SearchProfileRow = {
  username: string;
  fullName: string;
  bio: string | null;
  photoUrl: string | null;
  isVerified: boolean;
};

@Injectable()
export class SearchAction extends AbstractModelAction<User> {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {
    super(repo, User);
  }

  async searchProfiles(q: string): Promise<SearchProfileRow[]> {
    return this.repo
      .createQueryBuilder('u')
      .select([
        'u.username        AS username',
        'u.full_name       AS "fullName"',
        'u.bio             AS bio',
        'u.photo_url       AS "photoUrl"',
        'u.is_verified     AS "isVerified"',
      ])
      .where('u.is_published = true')
      .andWhere('u.deleted_at IS NULL')
      .andWhere('(u.full_name % :q OR u.username % :q)')
      .orderBy(
        'CASE WHEN lower(u.username) = lower(:q) THEN 1 ELSE 0 END',
        'DESC',
      )
      .addOrderBy(
        `GREATEST(similarity(u.full_name, :q), similarity(u.username, :q))`,
        'DESC',
      )
      .setParameter('q', q)
      .limit(20)
      .getRawMany<SearchProfileRow>();
  }
}
