import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModelAction } from './actions/user.action';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ResetPasswordModelAction } from './actions/reset-password.action';
import { ResetPassword } from '../auth/entities/reset-password.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, ResetPassword])],
  controllers: [UsersController],
  providers: [UserModelAction, ResetPasswordModelAction, UsersService],
  exports: [UsersService, UserModelAction, ResetPasswordModelAction],
})
export class UsersModule {}
