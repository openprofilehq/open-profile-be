import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import {
  QUEUE_NAMES,
  QueueName,
  QueueJobName,
} from './config/queue-names.constant';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  async addJob<T>(
    queueName: QueueName,
    jobName: QueueJobName,
    data: T,
    options?: JobsOptions,
  ) {
    try {
      const queue = this.getQueue(queueName);
      const job = await queue.add(jobName, data, options);
      this.logger.log(
        `Added job ${String(jobName)} to queue ${String(queueName)} with id ${String(
          job.id,
        )}`,
      );
      return job;
    } catch (error) {
      // `error` is `unknown` in TS; narrow it before accessing properties
      if (error instanceof Error) {
        this.logger.error(
          `Error adding job ${String(jobName)} to queue ${String(queueName)}: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Error adding job ${String(jobName)} to queue ${String(queueName)}: ${String(error)}`,
        );
      }
      throw error;
    }
  }

  // Add more methods for managing queues and jobs as needed
  private getQueue(queueName: QueueName): Queue {
    switch (queueName) {
      case QUEUE_NAMES.EMAIL:
        return this.emailQueue;
      default:
        throw new Error(`Unknown queue name: ${String(queueName)}`);
    }
  }
}
