import * as migration_20261101_104342_initial from './20261101_104342_initial';

export const migrations = [
  {
    up: migration_20261101_104342_initial.up,
    down: migration_20261101_104342_initial.down,
    name: '20261101_104342_initial'
  },
];
