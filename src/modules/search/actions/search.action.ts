import { AbstractModelAction } from '@hng-sdk/orm';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../../profile/entities/profile.entity';

const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEFAULT_LIMIT = 5;
const SEARCH_MAX_LIMIT = 20;
const BIO_TRUNCATE_LENGTH = 120;

type SearchProfileRow = {
  username: string;
  fullName: string;
  bio: string | null;
  photoUrl: string | null;
  // null when no photo — frontend renders initials from fullName
  isVerified: boolean;
  skills: string[];
};

export type PaginatedSearchResult = {
  results: SearchProfileRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type SearchProfilesOptions = {
  q: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class SearchAction extends AbstractModelAction<Profile> {
  constructor(
    @InjectRepository(Profile)
    private readonly repo: Repository<Profile>,
  ) {
    super(repo, Profile);
  }

  async searchProfiles({
    q,
    page = 1,
    limit = SEARCH_DEFAULT_LIMIT,
  }: SearchProfilesOptions): Promise<PaginatedSearchResult> {
    const normalizedQ = q.trim();

    if (normalizedQ.length < SEARCH_MIN_LENGTH) {
      throw new BadRequestException({
        code: 'QUERY_TOO_SHORT',
        message: `Search query must be at least ${SEARCH_MIN_LENGTH} characters.`,
      });
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), SEARCH_MAX_LIMIT);
    const offset = (safePage - 1) * safeLimit;

    const baseQuery = this.repo
      .createQueryBuilder('p')
      .where('p.is_published = true')
      // explicit guard — only active profiles are searchable
      .andWhere('p.deleted_at IS NULL')
      // explicit soft-delete guard — hidden/inactive accounts excluded
      .andWhere('p.is_searchable = true')
      .andWhere(
        `(
          p.full_name % :q
          OR p.username % :q
          OR EXISTS (
            SELECT 1 FROM unnest(p.skills) AS skill
            WHERE skill % :q
          )
        )`,
        // skills matched via unnest — each tag matched individually
        // short tags like "React", "Node.js" are ideal for pg_trgm
        // bio deferred to Phase 2 tsvector — too long for trigram matching
      )
      .setParameter('q', normalizedQ);

    const total = await baseQuery.getCount();

    const results = await baseQuery
      .clone()
      .select([
        'p.username                                            AS username',
        'p.full_name                                          AS "fullName"',
        `LEFT(p.bio, ${BIO_TRUNCATE_LENGTH})                  AS bio`,
        'p.photo_url                                          AS "photoUrl"',
        // returns null when no photo — frontend renders initials from fullName
        'p.is_verified                                        AS "isVerified"',
        'p.skills                                             AS skills',
        // returned so frontend can display matched skill tags
      ])
      .orderBy('CASE WHEN p.is_verified THEN 1 ELSE 0 END', 'DESC')
      // verified profiles rank above unverified at same similarity score
      .addOrderBy(
        'CASE WHEN lower(p.username) = lower(:q) THEN 1 ELSE 0 END',
        'DESC',
      )
      // exact username match ranks above partial matches
      .addOrderBy(
        'GREATEST(similarity(p.full_name, :q), similarity(p.username, :q))',
        'DESC',
      )
      // highest trigram similarity score ranks first
      .limit(safeLimit)
      .offset(offset)
      .getRawMany<SearchProfileRow>();

    return {
      results,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}
