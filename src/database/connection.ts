import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { app } from 'electron';
import { join } from 'path';
import { Card } from './entities/Card';

let dataSource: DataSource;

export async function initDatabase() {
  const dbPath = join(app.getPath('userData'), 'cardscanner.db');
  
  dataSource = new DataSource({
    type: 'sqlite',
    database: dbPath,
    entities: [Card],
    synchronize: true,
    logging: true,
  });

  await dataSource.initialize();
  console.log('Database initialized at:', dbPath);
  return dataSource;
}

export function getDatabase() {
  if (!dataSource) {
    throw new Error('Database not initialized');
  }
  return dataSource;
}