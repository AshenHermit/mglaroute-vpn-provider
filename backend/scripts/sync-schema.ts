import 'reflect-metadata';
import { AppDataSource } from '../src/common/postgres/data-source';

async function main() {
  if (process.env.DB_SYNCHRONIZE !== 'true') {
    throw new Error('Refusing to synchronize: set DB_SYNCHRONIZE=true explicitly');
  }
  await AppDataSource.initialize();
  await AppDataSource.synchronize(false);
  await AppDataSource.destroy();
  console.log('Database schema synchronized.');
}

main().catch((error) => {
  console.error(`Schema synchronization failed: ${error.message}`);
  process.exit(1);
});
