import { AbstractModelAction } from '@hng-sdk/orm';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import {
  USER_SEARCH_DEFAULT_LIMIT,
  USER_SEARCH_DEFAULT_PAGE,
  USER_SEARCH_MAX_LIMIT,
  USER_SEARCH_MIN_LENGTH,
} from '../dto/admin-user-query.dto';

export type AdminUserSearchRow = {
  id: string;
  fullName: string | null;
  username: string | null;
  email: string;
  role: UserRole | null;
  status: UserStatus;
  isPublished: boolean;
  photoUrl: string | null;
  createdAt: Date;
};

export type AdminUserSearchResult = {
  results: AdminUserSearchRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type SearchUsersOptions = {
  q: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class UserSearchAction extends AbstractModelAction<User> {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {
    super(repo, User);
  }

  async searchUsers({
    q,
    page = USER_SEARCH_DEFAULT_PAGE,
    limit = USER_SEARCH_DEFAULT_LIMIT,
  }: SearchUsersOptions): Promise<AdminUserSearchResult> {
    const normalizedQ = q.trim();

    if (normalizedQ.length < USER_SEARCH_MIN_LENGTH) {
      throw new BadRequestException({
        code: 'QUERY_TOO_SHORT',
        message: `Search query must be at least ${USER_SEARCH_MIN_LENGTH} characters.`,
      });
    }

    const safePage = Math.max(USER_SEARCH_DEFAULT_PAGE, page);
    const safeLimit = Math.min(Math.max(1, limit), USER_SEARCH_MAX_LIMIT);
    const offset = (safePage - 1) * safeLimit;

    const baseQuery = this.repo
      .createQueryBuilder('u')
      .where('u.deleted_at IS NULL')
      .andWhere('(u.full_name ILIKE :pattern OR u.username ILIKE :pattern)', {
        pattern: `%${normalizedQ}%`,
      });

    const [total, results] = await Promise.all([
      baseQuery.getCount(),
      baseQuery
        .clone()
        .select([
          'u.id                                        AS "id"',
          'u.full_name                                 AS "fullName"',
          'u.username                                  AS "username"',
          'u.email                                     AS "email"',
          'u.role                                      AS "role"',
          'u.status                                    AS "status"',
          'u.is_published                              AS "isPublished"',
          'u.photo_url                                 AS "photoUrl"',
          'u.created_at                                AS "createdAt"',
        ])
        .orderBy(
          'CASE WHEN lower(u.username) = lower(:q) THEN 1 ELSE 0 END',
          'DESC',
        )
        .addOrderBy('u.created_at', 'DESC')
        .setParameter('q', normalizedQ)
        .limit(safeLimit)
        .offset(offset)
        .getRawMany<AdminUserSearchRow>(),
    ]);

    return {
      results,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}
