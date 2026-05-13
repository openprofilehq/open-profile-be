import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserModelAction extends AbstractModelAction<User> {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {
    super(repo, User);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.get({ identifierOptions: { email } });
  }

  createQueryBuilder(alias: string) {
    //
    return this.repository.createQueryBuilder(alias);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.get({ identifierOptions: { username } });
  }
}
