# Таск: issue для EmDash — гонка інвалідації object cache (стара версія застрягає в кеші)

## Що треба зробити

1. Перевірити, чи проблема досі є в актуальному `main` репозиторію https://github.com/emdash-cms/emdash
   (пакет `packages/core`). Ми бачили її в `emdash@1.4.0` (npm, опубліковано 2026-10-29).
2. Пошукати серед відкритих і закритих issue/PR дублікати (ключові слова: object cache, epoch, stale,
   invalidateCollectionCache, transaction, commit).
3. Зробити мінімальне відтворення, незалежне від нашого бенчмарку (див. «Як відтворити» нижче; бажано
   невеликий скрипт, що б'є запитами в один процес EmDash).
4. Підготувати текст issue англійською у файл `tasks/emdash-object-cache-race-issue.md`
   (заготовка в кінці цього файлу) і, якщо вийде, варіант виправлення.
5. **Не публікувати issue і не відкривати PR без явного підтвердження користувача.**

## Контекст

Ми порівнюємо Payload і EmDash під навантаженням (репозиторій `~/projects/whitebit`, звіт `results/SUMMARY.md`,
розділ «With cache, level 1»). EmDash запущено в production-збірці:

- emdash 1.4.0, astro 7.4.4, @astrojs/node 11.1.9 (standalone), Node 24.22.1, один процес, 1 vCPU
- Postgres 17.6 (`emdash/db` → `postgres()`, пул 10, READ COMMITTED за замовчуванням)
- `objectCache: memoryCache()` (див. `emdash/astro.config.mjs`, вмикається збіркою з `CMS_CACHE=data`)
- колекція `articles` з `supports: []` (без чернеток і ревізій), i18n en/uk

## Симптом

Під навантаженням читання (~210 RPS) редагуємо заголовок статті через REST API
(`PUT /_emdash/api/content/articles/{id}?locale=en`, тіло `{ "data": { "title": ... } }`) і кожні 50 мс
опитуємо три сторінки, що показують цю статтю (сама стаття, перша сторінка категорії, головна).

- без навантаження: нова назва видна на всіх сторінках через 70–120 мс, порушень немає;
- при 210 RPS: **у 4 з 25 спроб** одна зі сторінок показувала **стару** назву більше 15 с (межа тесту);
  виправлялося лише наступним записом у колекцію. Без наступного запису стара версія жила б до TTL
  (`defaultTtl`, 1 година за замовчуванням).

Для порівняння: Payload 3.92 / Next 16 (`unstable_cache` + `revalidateTag` в `afterChange`) за тих самих умов
дав 0 застарілих із 25.

## Механізм (за кодом 1.4.0, шляхи з source maps пакета)

Запис — `handleContentUpdate` (`packages/core/src/api/handlers/content.ts:1570`) виконує все в
`withTransaction(db, …)` (`content.ts:1631`). Усередині транзакції викликається
`ContentRepository.update` (`packages/core/src/database/repositories/content.ts:1073`), який одразу після
`UPDATE` робить:

```ts
// src/database/repositories/content.ts:1150
if (hasColumnWrites) invalidateCollectionCache(type);
```

тобто піднімає епоху колекції **до `COMMIT`**. Після цього транзакція ще виконує
`syncNonTranslatableFields`, SEO, bylines, taxonomies, redirects; під навантаженням це 100–600 мс.

Читання — `cachedQueryWithEpochs` (`packages/core/src/object-cache/index.ts:539`):

```ts
const currentEpochs = await epochsPromise;          // index.ts:561 — епохи читаються до load()
...
const value = await options.load();                 // index.ts:575 — SQL поза транзакцією запису
...
const encoded = encode({ e: currentEpochs, v: value }); // index.ts:585 — запис у кеш під цими епохами
```

Послідовність, що дає застарілий запис:

```
writer: BEGIN → UPDATE → invalidateCollectionCache (epoch N → N+1) → ...ще запити... → COMMIT
reader:                   читає epoch N+1 → SELECT (бачить старий, ще не закомічений рядок)
                          → set(key, { e: [N+1], v: OLD })
наступні читачі: epoch N+1 збігається → віддають OLD до наступного запису або TTL
```

Ймовірно, той самий патерн у всіх місцях, де `invalidateCollectionCache` викликається всередині транзакції:
у `content.ts` це рядки 537, 1150, 1260, 1333, 1520, 1589, 1699, 1740, 1767, 2211, 2262, 2633, 2770, 2855
(publish, unpublish, delete, restore, schedule…). Варто перевірити, які з них викликаються з `trx`.

## Як відтворити в нашому репозиторії

```bash
cd ~/projects/whitebit
EMDASH_CACHE=data docker compose build emdash && docker compose up -d --wait postgres emdash
cd emdash && export EMDASH_TOKEN=$(PGDATABASE=emdash_bench node scripts/bench-token.mjs) && cd ..
# навантаження читанням у фоні (~50 % стелі з кешем)
VARIANT=race ./load/run.sh soak emdash -e RATE=210 -e DURATION=4m &
sleep 75
node load/invalidate.mjs emdash 15     # рядки з TIMEOUT = застаріла сторінка
```

`load/invalidate.mjs` в кінці повертає оригінальну назву статті.

## Можливі виправлення (для обговорення в issue)

- Інвалідувати **після** коміту: збирати namespace-и в транзакції і бампати епохи в after-commit
  (або повторно бампати після коміту — «invalidate before and after»).
- Альтернатива для читача: не кешувати результат, якщо `stampLastContentWrite`/епоха змінилися під час
  `load()` (в 1.4.0 уже є механізм «last content write» для Hyperdrive — `object-cache/index.ts`,
  `stampLastContentWrite`), але це не закриває вікно між бампом і комітом повністю.

## Заготовка issue (англійською)

**Title:** Object cache can store stale content: collection epoch is bumped before the write transaction commits

**Body:**

- Version: emdash 1.4.0, Postgres adapter, `objectCache: memoryCache()`, Node adapter (single process)
- What happens: under concurrent reads, an update made through the content API can leave a cached query
  result with the old value under the new epoch; the stale value is served until the next write to the
  collection or `defaultTtl`.
- Why: `ContentRepository.update` calls `invalidateCollectionCache(type)` right after the `UPDATE`
  (`src/database/repositories/content.ts`), while `handleContentUpdate` runs it inside `withTransaction`
  and continues with more statements before `COMMIT`. A reader that starts in this window reads the new epoch
  in `cachedQueryWithEpochs` (`src/object-cache/index.ts`), loads the not-yet-committed (old) row and caches it
  under the new epoch.
- Repro: N concurrent readers of a listing/entry + one `PUT /_emdash/api/content/{collection}/{id}`; poll until
  the new value appears. We saw 4 of 25 updates stay stale for > 15 s at ~210 req/s, none without load.
- Suggested fix: bump epochs after the transaction commits (or both before and after).
