import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import {
  AdminUsersQueryDto,
  UpdateUserStatusDto,
} from './dto/admin-user-query.dto';
import {
  AdminUserDetailResponseDto,
  AdminUserSearchResponseDto,
  AdminUserStatusResponseDto,
} from './dto/admin-user-response.dto';
import { AdminUsersService } from './services/admin-users.service';

interface AuthRequest extends Request {
  user: AuthenticatedUser;
}

@ApiTags('admin/users')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/users', version: '1' })
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Search users',
    description:
      'Search users by full name or username (case-insensitive, minimum ' +
      '2 characters). Exact username matches rank first. Paginated.',
  })
  @ApiResponse({
    status: 200,
    type: AdminUserSearchResponseDto,
    description: 'Matching users returned',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 422, description: 'Invalid query parameters' })
  async searchUsers(@Query() query: AdminUsersQueryDto) {
    return {
      success: true,
      data: await this.adminUsersService.searchUsers(query),
    };
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Get user detail',
    description:
      'Returns user summary fields plus per-user stats: profile completion, ' +
      'views, link clicks, and search conversion (all-time).',
  })
  @ApiResponse({
    status: 200,
    type: AdminUserDetailResponseDto,
    description: 'User detail returned',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDetail(@Param('id') id: string) {
    return {
      success: true,
      data: await this.adminUsersService.getUserDetail(id),
    };
  }

  @Patch(':id/status')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Change user status',
    description:
      'Applies an audited status action (block | suspend | deactivate | ' +
      'reactivate | flag_for_review). Invalid transitions are rejected with ' +
      '409; unknown actions with 422. Applying the target status the user ' +
      'already has returns the current status with changed=false.',
  })
  @ApiResponse({
    status: 200,
    type: AdminUserStatusResponseDto,
    description: 'Status change applied',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Invalid status transition' })
  @ApiResponse({ status: 422, description: 'Invalid action' })
  async updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      data: await this.adminUsersService.changeStatus(
        id,
        dto.action,
        req.user.sub,
      ),
    };
  }
}
