import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../../profile/entities/profile.entity';
import { User, UserStatus } from '../../users/entities/user.entity';
import { UserSearchAction } from '../actions/user-search.action';
import { UserStatsAction } from '../actions/user-stats.action';
import { AccountStatusService } from './account-status.service';
import { UserStatusAction } from '../constants/status-transitions';
import { AdminUsersQueryDto } from '../dto/admin-user-query.dto';
import {
  AdminUserDetailDto,
  AdminUserSummaryDto,
  StatusChangeResultDto,
  UserSearchDataDto,
} from '../dto/admin-user-response.dto';

function isActiveStatus(status: UserStatus): boolean {
  return status !== UserStatus.SUSPENDED && status !== UserStatus.DEACTIVATED;
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    private readonly userSearchAction: UserSearchAction,
    private readonly userStatsAction: UserStatsAction,
    private readonly accountStatusService: AccountStatusService,
  ) {}

  async searchUsers(query: AdminUsersQueryDto): Promise<UserSearchDataDto> {
    const { results, total, page, limit, totalPages } =
      await this.userSearchAction.searchUsers(query);

    return {
      results: results.map((row) => this.toSummaryDto(row)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getUserDetail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = await this.profileRepo.findOne({
      where: { userId: id },
    });

    const [profileCompletion, clicks, searchConversion] = profile
      ? await Promise.all([
          this.userStatsAction.profileCompletion(id),
          this.userStatsAction.clickCount(profile.id),
          this.userStatsAction.searchConversion(profile.id),
        ])
      : [
          0,
          0,
          { searchesSurfaced: 0, searchDrivenViews: 0, conversionRate: 0 },
        ];

    return {
      id: user.id,
      fullName: user.fullName,
      username: profile?.username ?? user.username,
      email: user.email,
      status: user.status,
      role: user.role,
      isPublished: profile?.isPublished ?? false,
      isActive: isActiveStatus(user.status),
      photoUrl: profile?.photoUrl ?? user.photoUrl,
      createdAt: user.createdAt,
      profileCompletion,
      views: profile?.viewCount ?? 0,
      clicks,
      searchConversion: searchConversion.conversionRate,
    };
  }

  async changeStatus(
    id: string,
    action: UserStatusAction,
    actingAdminId: string,
  ): Promise<StatusChangeResultDto> {
    const result = await this.accountStatusService.apply(
      id,
      action,
      actingAdminId,
    );
    return {
      from: result.from,
      to: result.to,
      changed: result.changed,
    };
  }

  private toSummaryDto(row: {
    id: string;
    fullName: string | null;
    username: string | null;
    email: string;
    role: User['role'];
    status: UserStatus;
    isPublished: boolean;
    photoUrl: string | null;
    createdAt: Date;
  }): AdminUserSummaryDto {
    return {
      id: row.id,
      fullName: row.fullName,
      username: row.username,
      email: row.email,
      status: row.status,
      role: row.role,
      isPublished: row.isPublished,
      isActive: isActiveStatus(row.status),
      photoUrl: row.photoUrl,
      createdAt: row.createdAt,
    };
  }
}
