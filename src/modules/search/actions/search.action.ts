import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../../profile/entities/profile.entity';

type SearchProfileRow = {
  username: string;
  fullName: string;
  bio: string | null;
  photoUrl: string | null;
  isVerified: boolean;
};

@Injectable()
export class SearchAction extends AbstractModelAction<Profile> {
  constructor(
    @InjectRepository(Profile)
    private readonly repo: Repository<Profile>,
  ) {
    super(repo, Profile);
  }

  async searchProfiles(q: string): Promise<SearchProfileRow[]> {
    return this.repo
      .createQueryBuilder('p')
      .select([
        'p.username        AS username',
        'p.full_name       AS "fullName"',
        'p.bio             AS bio',
        'p.photo_url       AS "photoUrl"',
        'p.is_verified     AS "isVerified"',
      ])
      .where('p.is_published = true')
      .andWhere('p.deleted_at IS NULL')
      .andWhere('p.is_searchable = true') // 👈 respect is_searchable flag
      .andWhere('(p.full_name % :q OR p.username % :q)')
      .orderBy(
        'CASE WHEN lower(p.username) = lower(:q) THEN 1 ELSE 0 END',
        'DESC',
      )
      .addOrderBy(
        `GREATEST(similarity(p.full_name, :q), similarity(p.username, :q))`,
        'DESC',
      )
      .setParameter('q', q)
      .limit(20)
      .getRawMany<SearchProfileRow>();
  }
}
