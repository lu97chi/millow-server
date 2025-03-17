import { registerAs } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';

export const databaseConfig = registerAs(
  'database',
  (): MongooseModuleOptions => ({
    uri: process.env.MONGODB_URI,
    // Modern MongoDB drivers no longer need these options
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4, // Use IPv4, skip trying IPv6
  }),
);
