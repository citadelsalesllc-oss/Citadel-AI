import { TEST_DATABASE_URL } from './test-db-url.js';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.MODEL_PROVIDER = 'mock';
process.env.PUBLISH_PROVIDER = 'mock';
process.env.NODE_ENV = 'test';
