import dotenv from 'dotenv';

dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://syscraft:syscraft-db-pass@127.0.0.1:5432/syscraft',
  JWT_SECRET: process.env.JWT_SECRET || 'syscraft-dev-secret-change-me',
  SATELLITE_URL: process.env.SATELLITE_URL || 'https://satellite.ailab.local',
  SATELLITE_USER: process.env.SATELLITE_USER || 'admin',
  SATELLITE_PASSWORD: process.env.SATELLITE_PASSWORD || 'uwx9UVoUCfVdavna',
  CHECKMK_URL: process.env.CHECKMK_URL || 'http://localhost:8080/cmk/check_mk/api/1.0',
  CHECKMK_USER: process.env.CHECKMK_USER || 'cmkadmin',
  CHECKMK_PASSWORD: process.env.CHECKMK_PASSWORD || 'checkmk123',
  SYNC_INTERVAL_MINUTES: parseInt(process.env.SYNC_INTERVAL_MINUTES || '15', 10),
  STALE_THRESHOLD_HOURS: parseInt(process.env.STALE_THRESHOLD_HOURS || '72', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;
