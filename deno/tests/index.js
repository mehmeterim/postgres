import { Buffer } from 'https://deno.land/std@0.120.0/node/buffer.ts'
/* eslint no-console: 0 */

import { exec } from './bootstrap.js'

import { t, nt, ot } from './test.js' // eslint-disable-line
import cp from 'https://deno.land/std@0.120.0/node/child_process.ts'
import path from 'https://deno.land/std@0.120.0/node/path.ts'
import { net } from '../polyfills.js'
import fs from 'https://deno.land/std@0.120.0/node/fs.ts'
import crypto from 'https://deno.land/std@0.120.0/node/crypto.ts'

import postgres from '../src/index.js'
const delay = ms => new Promise(r => setTimeout(r, ms))

const rel = x => new URL(x, import.meta.url)
const idle_timeout = 1

const login = {
  user: 'postgres_js_test'
}

const login_md5 = {
  user: 'postgres_js_test_md5',
  pass: 'postgres_js_test_md5'
}

const login_scram = {
  user: 'postgres_js_test_scram',
  pass: 'postgres_js_test_scram'
}

const options = {
  db: 'postgres_js_test',
  user: login.user,
  pass: login.pass,
  idle_timeout,
  connect_timeout: 1,
  max: 1
}

const sql = postgres(options)

t('Connects with no options', async() => {
  const sql = postgres({ max: 1 })

  const result = (await sql`select 1 as x`)[0].x
  await sql.end()

  return [1, result]
})

t('Uses default database without slash', async() => {
  const sql = postgres('postgres://localhost')
  return [sql.options.user, sql.options.database]
})

t('Uses default database with slash', async() => {
  const sql = postgres('postgres://localhost/')
  return [sql.options.user, sql.options.database]
})

t('Result is array', async() =>
  [true, Array.isArray(await sql`select 1`)]
)

t('Result has count', async() =>
  [1, (await sql`select 1`).count]
)

t('Result has command', async() =>
  ['SELECT', (await sql`select 1`).command]
)

t('Create table', async() =>
  ['CREATE TABLE', (await sql`create table test(int int)`).command, await sql`drop table test`]
)

t('Drop table', { timeout: 2 }, async() => {
  await sql`create table test(int int)`
  return ['DROP TABLE', (await sql`drop table test`).command]
})

t('null', async() =>
  [null, (await sql`select ${ null } as x`)[0].x]
)

t('Integer', async() =>
  ['1', (await sql`select ${ 1 } as x`)[0].x]
)

t('String', async() =>
  ['hello', (await sql`select ${ 'hello' } as x`)[0].x]
)

t('Boolean false', async() =>
  [false, (await sql`select ${ false } as x`)[0].x]
)

t('Boolean true', async() =>
  [true, (await sql`select ${ true } as x`)[0].x]
)

t('Date', async() => {
  const now = new Date()
  return [0, now - (await sql`select ${ now } as x`)[0].x]
})

t('Json', async() => {
  const x = (await sql`select ${ sql.json({ a: 'hello', b: 42 }) } as x`)[0].x
  return ['hello,42', [x.a, x.b].join()]
})

t('implicit json', async() => {
  const x = (await sql`select ${ { a: 'hello', b: 42 } }::json as x`)[0].x
  return ['hello,42', [x.a, x.b].join()]
})

t('implicit jsonb', async() => {
  const x = (await sql`select ${ { a: 'hello', b: 42 } }::jsonb as x`)[0].x
  return ['hello,42', [x.a, x.b].join()]
})

t('Empty array', async() =>
  [true, Array.isArray((await sql`select ${ sql.array([], 1009) } as x`)[0].x)]
)

t('String array', async() =>
  ['123', (await sql`select ${ '{1,2,3}' }::int[] as x`)[0].x.join('')]
)

t('Array of Integer', async() =>
  ['3', (await sql`select ${ sql.array([1, 2, 3]) } as x`)[0].x[2]]
)

t('Array of String', async() =>
  ['c', (await sql`select ${ sql.array(['a', 'b', 'c']) } as x`)[0].x[2]]
)

t('Array of Date', async() => {
  const now = new Date()
  return [now.getTime(), (await sql`select ${ sql.array([now, now, now]) } as x`)[0].x[2].getTime()]
})

t('Nested array n2', async() =>
  ['4', (await sql`select ${ sql.array([[1, 2], [3, 4]]) } as x`)[0].x[1][1]]
)

t('Nested array n3', async() =>
  ['6', (await sql`select ${ sql.array([[[1, 2]], [[3, 4]], [[5, 6]]]) } as x`)[0].x[2][0][1]]
)

t('Escape in arrays', async() =>
  ['Hello "you",c:\\windows', (await sql`select ${ sql.array(['Hello "you"', 'c:\\windows']) } as x`)[0].x.join(',')]
)

t('Escapes', async() => {
  return ['hej"hej', Object.keys((await sql`select 1 as ${ sql('hej"hej') }`)[0])[0]]
})

t('null for int', async() => {
  await sql`create table test (x int)`
  return [1, (await sql`insert into test values(${ null })`).count, await sql`drop table test`]
})

t('Transaction throws', async() => {
  await sql`create table test (a int)`
  return ['22P02', await sql.begin(async sql => {
    await sql`insert into test values(1)`
    await sql`insert into test values('hej')`
  }).catch(x => x.code), await sql`drop table test`]
})

t('Transaction rolls back', async() => {
  await sql`create table test (a int)`
  await sql.begin(async sql => {
    await sql`insert into test values(1)`
    await sql`insert into test values('hej')`
  }).catch(() => { /* ignore */ })
  return [0, (await sql`select a from test`).count, await sql`drop table test`]
})

t('Transaction throws on uncaught savepoint', async() => {
  await sql`create table test (a int)`

  return ['fail', (await sql.begin(async sql => {
    await sql`insert into test values(1)`
    await sql.savepoint(async sql => {
      await sql`insert into test values(2)`
      throw new Error('fail')
    })
  }).catch((err) => err.message)), await sql`drop table test`]
})

t('Transaction throws on uncaught named savepoint', async() => {
  await sql`create table test (a int)`

  return ['fail', (await sql.begin(async sql => {
    await sql`insert into test values(1)`
    await sql.savepoit('watpoint', async sql => {
      await sql`insert into test values(2)`
      throw new Error('fail')
    })
  }).catch(() => 'fail')), await sql`drop table test`]
})

t('Transaction succeeds on caught savepoint', async() => {
  await sql`create table test (a int)`
  await sql.begin(async sql => {
    await sql`insert into test values(1)`
    await sql.savepoint(async sql => {
      await sql`insert into test values(2)`
      throw new Error('please rollback')
    }).catch(() => { /* ignore */ })
    await sql`insert into test values(3)`
  })

  return ['2', (await sql`select count(1) from test`)[0].count, await sql`drop table test`]
})

t('Savepoint returns Result', async() => {
  let result
  await sql.begin(async sql => {
    result = await sql.savepoint(sql =>
      sql`select 1 as x`
    )
  })

  return [1, result[0].x]
})

t('Transaction requests are executed implicitly', async() => {
  const sql = postgres({ debug: true, idle_timeout: 1, fetch_types: false })
  return [
    'testing',
    (await sql.begin(async sql => {
      sql`select set_config('postgres_js.test', 'testing', true)`
      return await sql`select current_setting('postgres_js.test') as x`
    }))[0].x
  ]
})

t('Uncaught transaction request errors bubbles to transaction', async() => [
  '42703',
  (await sql.begin(sql => (
    sql`select wat`,
    sql`select current_setting('postgres_js.test') as x, ${ 1 } as a`
  )).catch(e => e.code))
])

t('Parallel transactions', async() => {
  await sql`create table test (a int)`
  return ['11', (await Promise.all([
    sql.begin(sql => sql`select 1`),
    sql.begin(sql => sql`select 1`)
  ])).map(x => x.count).join(''), await sql`drop table test`]
})

t('Transactions array', async() => {
  await sql`create table test (a int)`

  return ['11', (await sql.begin(sql => [
    sql`select 1`.then(x => x),
    sql`select 1`
  ])).map(x => x.count).join(''), await sql`drop table test`]
})

t('Transaction waits', async() => {
  await sql`create table test (a int)`
  await sql.begin(async sql => {
    await sql`insert into test values(1)`
    await sql.savepoint(async sql => {
      await sql`insert into test values(2)`
      throw new Error('please rollback')
    }).catch(() => { /* ignore */ })
    await sql`insert into test values(3)`
  })

  return ['11', (await Promise.all([
    sql.begin(sql => sql`select 1`),
    sql.begin(sql => sql`select 1`)
  ])).map(x => x.count).join(''), await sql`drop table test`]
})

t('Helpers in Transaction', async() => {
  return ['1', (await sql.begin(async sql =>
    await sql`select ${ sql({ x: 1 }) }`
  ))[0].x]
})

t('Undefined values throws', async() => {
  let error

  await sql`
    select ${ undefined } as x
  `.catch(x => error = x.code)

  return ['UNDEFINED_VALUE', error]
})

t('Null sets to null', async() =>
  [null, (await sql`select ${ null } as x`)[0].x]
)

t('Throw syntax error', async() =>
  ['42601', (await sql`wat 1`.catch(x => x)).code]
)

t('Connect using uri', async() =>
  [true, await new Promise((resolve, reject) => {
    const sql = postgres('postgres://' + login.user + ':' + (login.pass || '') + '@localhost:5432/' + options.db, {
      idle_timeout
    })
    sql`select 1`.then(() => resolve(true), reject)
  })]
)

t('Fail with proper error on no host', async() =>
  ['ECONNREFUSED', (await new Promise((resolve, reject) => {
    const sql = postgres('postgres://localhost:33333/' + options.db, {
      idle_timeout
    })
    sql`select 1`.then(reject, resolve)
  })).code]
)

t('Connect using SSL', async() =>
  [true, (await new Promise((resolve, reject) => {
    postgres({
      ssl: { rejectUnauthorized: false },
      idle_timeout
    })`select 1`.then(() => resolve(true), reject)
  }))]
)

t('Connect using SSL require', async() =>
  [true, (await new Promise((resolve, reject) => {
    postgres({
      ssl: 'require',
      idle_timeout
    })`select 1`.then(() => resolve(true), reject)
  }))]
)

t('Connect using SSL prefer', async() => {
  await exec('psql', ['-c', 'alter system set ssl=off'])
  await exec('psql', ['-c', 'select pg_reload_conf()'])

  const sql = postgres({
    ssl: 'prefer',
    idle_timeout
  })

  return [
    1, (await sql`select 1 as x`)[0].x,
    await exec('psql', ['-c', 'alter system set ssl=on']),
    await exec('psql', ['-c', 'select pg_reload_conf()'])
  ]
})

t('Reconnect using SSL', { timeout: 2 }, async() => {
  const sql = postgres({
    ssl: 'require',
    idle_timeout: 0.1
  })

  await sql`select 1`
  await delay(200)

  return [1, (await sql`select 1 as x`)[0].x]
})

t('Login without password', async() => {
  return [true, (await postgres({ ...options, ...login })`select true as x`)[0].x]
})

t('Login using MD5', async() => {
  return [true, (await postgres({ ...options, ...login_md5 })`select true as x`)[0].x]
})

t('Login using scram-sha-256', async() => {
  return [true, (await postgres({ ...options, ...login_scram })`select true as x`)[0].x]
})

t('Parallel connections using scram-sha-256', {
  timeout: 2
}, async() => {
  const sql = postgres({ ...options, ...login_scram })
  return [true, (await Promise.all([
    sql`select true as x, pg_sleep(0.2)`,
    sql`select true as x, pg_sleep(0.2)`,
    sql`select true as x, pg_sleep(0.2)`
  ]))[0][0].x]
})

t('Support dynamic password function', async() => {
  return [true, (await postgres({
    ...options,
    ...login_scram,
    pass: () => 'postgres_js_test_scram'
  })`select true as x`)[0].x]
})

t('Support dynamic async password function', async() => {
  return [true, (await postgres({
    ...options,
    ...login_scram,
    pass: () => Promise.resolve('postgres_js_test_scram')
  })`select true as x`)[0].x]
})

t('Point type', async() => {
  const sql = postgres({
    ...options,
    types: {
      point: {
        to: 600,
        from: [600],
        serialize: ([x, y]) => '(' + x + ',' + y + ')',
        parse: (x) => x.slice(1, -1).split(',').map(x => +x)
      }
    }
  })

  await sql`create table test (x point)`
  await sql`insert into test (x) values (${ sql.types.point([10, 20]) })`
  return [20, (await sql`select x from test`)[0].x[1], await sql`drop table test`]
})

t('Point type array', async() => {
  const sql = postgres({
    ...options,
    types: {
      point: {
        to: 600,
        from: [600],
        serialize: ([x, y]) => '(' + x + ',' + y + ')',
        parse: (x) => x.slice(1, -1).split(',').map(x => +x)
      }
    }
  })

  await sql`create table test (x point[])`
  await sql`insert into test (x) values (${ sql.array([sql.types.point([10, 20]), sql.types.point([20, 30])]) })`
  return [30, (await sql`select x from test`)[0].x[1][1], await sql`drop table test`]
})

t('sql file', async() =>
  [1, (await sql.file(rel('select.sql')))[0].x]
)

t('sql file has forEach', async() => {
  let result
  await sql
    .file(rel('select.sql'), { cache: false })
    .forEach(({ x }) => result = x)

  return [1, result]
})

t('sql file throws', async() =>
  ['ENOENT', (await sql.file(rel('selectomondo.sql')).catch(x => x.code))]
)

t('sql file cached', async() => {
  await sql.file(rel('select.sql'))
  await delay(20)

  return [1, (await sql.file(rel('select.sql')))[0].x]
})

t('Parameters in file', async() => {
  const result = await sql.file(
    rel('select-param.sql'),
    ['hello']
  )
  return ['hello', result[0].x]
})

t('Connection ended promise', async() => {
  const sql = postgres(options)

  await sql.end()

  return [undefined, await sql.end()]
})

t('Connection ended timeout', async() => {
  const sql = postgres(options)

  await sql.end({ timeout: 10 })

  return [undefined, await sql.end()]
})

t('Connection ended error', async() => {
  const sql = postgres(options)
  sql.end()
  return ['CONNECTION_ENDED', (await sql``.catch(x => x.code))]
})

t('Connection end does not cancel query', async() => {
  const sql = postgres(options)

  const promise = sql`select 1 as x`.execute()

  sql.end()

  return [1, (await promise)[0].x]
})

t('Connection destroyed', async() => {
  const sql = postgres(options)
  setTimeout(() => sql.end({ timeout: 0 }), 0)
  return ['CONNECTION_DESTROYED', await sql``.catch(x => x.code)]
})

t('Connection destroyed with query before', async() => {
  const sql = postgres(options)
      , error = sql`select pg_sleep(0.2)`.catch(err => err.code)

  sql.end({ timeout: 0 })
  return ['CONNECTION_DESTROYED', await error]
})

t('transform column', async() => {
  const sql = postgres({
    ...options,
    transform: { column: x => x.split('').reverse().join('') }
  })

  await sql`create table test (hello_world int)`
  await sql`insert into test values (1)`
  return ['dlrow_olleh', Object.keys((await sql`select * from test`)[0])[0], await sql`drop table test`]
})

t('column toPascal', async() => {
  const sql = postgres({
    ...options,
    transform: { column: postgres.toPascal }
  })

  await sql`create table test (hello_world int)`
  await sql`insert into test values (1)`
  return ['HelloWorld', Object.keys((await sql`select * from test`)[0])[0], await sql`drop table test`]
})

t('column toCamel', async() => {
  const sql = postgres({
    ...options,
    transform: { column: postgres.toCamel }
  })

  await sql`create table test (hello_world int)`
  await sql`insert into test values (1)`
  return ['helloWorld', Object.keys((await sql`select * from test`)[0])[0], await sql`drop table test`]
})

t('column toKebab', async() => {
  const sql = postgres({
    ...options,
    transform: { column: postgres.toKebab }
  })

  await sql`create table test (hello_world int)`
  await sql`insert into test values (1)`
  return ['hello-world', Object.keys((await sql`select * from test`)[0])[0], await sql`drop table test`]
})

t('unsafe', async() => {
  await sql`create table test (x int)`
  return [1, (await sql.unsafe('insert into test values ($1) returning *', [1]))[0].x, await sql`drop table test`]
})

t('unsafe simple', async() => {
  return [1, (await sql.unsafe('select 1 as x'))[0].x]
})

t('listen and notify', async() => {
  const sql = postgres(options)
      , channel = 'hello'

  return ['world', await new Promise((resolve, reject) =>
    sql.listen(channel, resolve)
    .then(() => sql.notify(channel, 'world'))
    .then(() => delay(20))
    .catch(reject)
    .then(sql.end)
  )]
})

t('double listen', async() => {
  const sql = postgres(options)
      , channel = 'hello'

  let count = 0

  await new Promise((resolve, reject) =>
    sql.listen(channel, resolve)
    .then(() => sql.notify(channel, 'world'))
    .catch(reject)
  ).then(() => count++)

  await new Promise((resolve, reject) =>
    sql.listen(channel, resolve)
    .then(() => sql.notify(channel, 'world'))
    .catch(reject)
  ).then(() => count++)

  // for coverage
  sql.listen('weee', () => { /* noop */ }).then(sql.end)

  return [2, count]
})

t('listen and notify with weird name', async() => {
  const sql = postgres(options)
      , channel = 'wat-;ø§'

  return ['world', await new Promise((resolve, reject) =>
    sql.listen(channel, resolve)
    .then(() => sql.notify(channel, 'world'))
    .catch(reject)
    .then(() => delay(20))
    .then(sql.end)
  )]
})

t('listen and notify with upper case', async() => {
  const sql = postgres(options)
  let result

  await sql.listen('withUpperChar', x => result = x)
  sql.notify('withUpperChar', 'works')
  await delay(50)

  return [
    'works',
    result,
    sql.end()
  ]
})

t('listen reconnects', { timeout: 2 }, async() => {
  const sql = postgres(options)
      , xs = []

  const { state: { pid } } = await sql.listen('test', x => xs.push(x))
  await delay(200)
  await sql.notify('test', 'a')
  await sql`select pg_terminate_backend(${ pid }::int)`
  await delay(200)
  await sql.notify('test', 'b')
  await delay(200)
  sql.end()

  return ['ab', xs.join('')]
})


t('listen reconnects after connection error', { timeout: 3 }, async() => {
  const sql = postgres()
      , xs = []

  const a = (await sql`show data_directory`)[0].data_directory

  const { state: { pid } } = await sql.listen('test', x => xs.push(x))
  await sql.notify('test', 'a')
  await sql`select pg_terminate_backend(${ pid }::int)`
  await delay(1000)

  await sql.notify('test', 'b')
  await delay(50)
  sql.end()

  return ['ab', xs.join('')]
})

t('listen result reports correct connection state after reconnection', async() => {
  const sql = postgres(options)
      , xs = []

  const result = await sql.listen('test', x => xs.push(x))
  const initialPid = result.state.pid
  await sql.notify('test', 'a')
  await sql`select pg_terminate_backend(${ initialPid }::int)`
  await delay(50)
  sql.end()

  return [result.state.pid !== initialPid, true]
})

t('unlisten removes subscription', async() => {
  const sql = postgres(options)
      , xs = []

  const { unlisten } = await sql.listen('test', x => xs.push(x))
  await sql.notify('test', 'a')
  await delay(50)
  await unlisten()
  await sql.notify('test', 'b')
  await delay(50)
  sql.end()

  return ['a', xs.join('')]
})

t('listen after unlisten', async() => {
  const sql = postgres(options)
      , xs = []

  const { unlisten } = await sql.listen('test', x => xs.push(x))
  await sql.notify('test', 'a')
  await delay(50)
  await unlisten()
  await sql.notify('test', 'b')
  await delay(50)
  await sql.listen('test', x => xs.push(x))
  await sql.notify('test', 'c')
  await delay(50)
  sql.end()

  return ['ac', xs.join('')]
})

t('multiple listeners and unlisten one', async() => {
  const sql = postgres(options)
      , xs = []

  await sql.listen('test', x => xs.push('1', x))
  const s2 = await sql.listen('test', x => xs.push('2', x))
  await sql.notify('test', 'a')
  await delay(50)
  await s2.unlisten()
  await sql.notify('test', 'b')
  await delay(50)
  sql.end()

  return ['1a2a1b', xs.join('')]
})

t('responds with server parameters (application_name)', async() =>
  ['postgres.js', await new Promise((resolve, reject) => postgres({
    ...options,
    onparameter: (k, v) => k === 'application_name' && resolve(v)
  })`select 1`.catch(reject))]
)

t('has server parameters', async() => {
  return ['postgres.js', (await sql`select 1`.then(() => sql.parameters.application_name))]
})

t('big query body', async() => {
  await sql`create table test (x int)`
  return [1000, (await sql`insert into test ${
    sql([...Array(1000).keys()].map(x => ({ x })))
  }`).count, await sql`drop table test`]
})

t('Throws if more than 65534 parameters', async() => {
  await sql`create table test (x int)`
  return ['MAX_PARAMETERS_EXCEEDED', (await sql`insert into test ${
    sql([...Array(65535).keys()].map(x => ({ x })))
  }`.catch(e => e.code)), await sql`drop table test`]
})

t('let postgres do implicit cast of unknown types', async() => {
  await sql`create table test (x timestamp with time zone)`
  const [{ x }] = await sql`insert into test values (${ new Date().toISOString() }) returning *`
  return [true, x instanceof Date, await sql`drop table test`]
})

t('only allows one statement', async() =>
  ['42601', await sql`select 1; select 2`.catch(e => e.code)]
)

t('await sql() throws not tagged error', async() => {
  let error
  try {
    await sql('select 1')
  } catch (e) {
    error = e.code
  }
  return ['NOT_TAGGED_CALL', error]
})

t('sql().then throws not tagged error', async() => {
  let error
  try {
    sql('select 1').then(() => { /* noop */ })
  } catch (e) {
    error = e.code
  }
  return ['NOT_TAGGED_CALL', error]
})

t('sql().catch throws not tagged error', async() => {
  let error
  try {
    await sql('select 1')
  } catch (e) {
    error = e.code
  }
  return ['NOT_TAGGED_CALL', error]
})

t('sql().finally throws not tagged error', async() => {
  let error
  try {
    sql('select 1').finally(() => { /* noop */ })
  } catch (e) {
    error = e.code
  }
  return ['NOT_TAGGED_CALL', error]
})

t('little bobby tables', async() => {
  const name = 'Robert\'); DROP TABLE students;--'

  await sql`create table students (name text, age int)`
  await sql`insert into students (name) values (${ name })`

  return [
    name, (await sql`select name from students`)[0].name,
    await sql`drop table students`
  ]
})

t('Connection errors are caught using begin()', {
  timeout: 2
}, async() => {
  let error
  try {
    const sql = postgres({ host: 'wat', port: 1337 })

    await sql.begin(async(sql) => {
      await sql`insert into test (label, value) values (${1}, ${2})`
    })
  } catch (err) {
    error = err
  }

  return [
    true,
    error.code === 'ENOTFOUND' ||
    error.message === 'failed to lookup address information: nodename nor servname provided, or not known'
  ]
})

t('dynamic column name', async() => {
  return ['!not_valid', Object.keys((await sql`select 1 as ${ sql('!not_valid') }`)[0])[0]]
})

t('dynamic select as', async() => {
  return ['2', (await sql`select ${ sql({ a: 1, b: 2 }) }`)[0].b]
})

t('dynamic select as pluck', async() => {
  return [undefined, (await sql`select ${ sql({ a: 1, b: 2 }, 'a') }`)[0].b]
})

t('dynamic insert', async() => {
  await sql`create table test (a int, b text)`
  const x = { a: 42, b: 'the answer' }

  return ['the answer', (await sql`insert into test ${ sql(x) } returning *`)[0].b, await sql`drop table test`]
})

t('dynamic insert pluck', async() => {
  await sql`create table test (a int, b text)`
  const x = { a: 42, b: 'the answer' }

  return [null, (await sql`insert into test ${ sql(x, 'a') } returning *`)[0].b, await sql`drop table test`]
})

t('array insert', async() => {
  await sql`create table test (a int, b int)`
  return [2, (await sql`insert into test (a, b) values (${ [1, 2] }) returning *`)[0].b, await sql`drop table test`]
})

t('parameters in()', async() => {
  return [2, (await sql`
    with rows as (
      select * from (values (1), (2), (3), (4)) as x(a)
    )
    select * from rows where a in (${ [3, 4] })
  `).count]
})

t('dynamic multi row insert', async() => {
  await sql`create table test (a int, b text)`
  const x = { a: 42, b: 'the answer' }

  return [
    'the answer',
    (await sql`insert into test ${ sql([x, x]) } returning *`)[1].b, await sql`drop table test`
  ]
})

t('dynamic update', async() => {
  await sql`create table test (a int, b text)`
  await sql`insert into test (a, b) values (17, 'wrong')`

  return [
    'the answer',
    (await sql`update test set ${ sql({ a: 42, b: 'the answer' }) } returning *`)[0].b, await sql`drop table test`
  ]
})

t('dynamic update pluck', async() => {
  await sql`create table test (a int, b text)`
  await sql`insert into test (a, b) values (17, 'wrong')`

  return [
    'wrong',
    (await sql`update test set ${ sql({ a: 42, b: 'the answer' }, 'a') } returning *`)[0].b, await sql`drop table test`
  ]
})

t('dynamic select array', async() => {
  await sql`create table test (a int, b text)`
  await sql`insert into test (a, b) values (42, 'yay')`
  return ['yay', (await sql`select ${ sql(['a', 'b']) } from test`)[0].b, await sql`drop table test`]
})

t('dynamic select args', async() => {
  await sql`create table test (a int, b text)`
  await sql`insert into test (a, b) values (42, 'yay')`
  return ['yay', (await sql`select ${ sql('a', 'b') } from test`)[0].b, await sql`drop table test`]
})

t('dynamic values single row', async() => {
  const [{ b }] = await sql`
    select * from (values ${ sql(['a', 'b', 'c']) }) AS x(a, b, c)
  `

  return ['b', b]
})

t('dynamic values multi row', async() => {
  const [_, { b }] = await sql`
    select * from (values ${ sql([['a', 'b', 'c'],['a', 'b', 'c']]) }) AS x(a, b, c)
  `

  return ['b', b]
})

t('connection parameters', async() => {
  const sql = postgres({
    ...options,
    connection: {
      'some.var': 'yay'
    }
  })

  return ['yay', (await sql`select current_setting('some.var') as x`)[0].x]
})

t('Multiple queries', async() => {
  const sql = postgres(options)

  return [4, (await Promise.all([
    sql`select 1`,
    sql`select 2`,
    sql`select 3`,
    sql`select 4`
  ])).length]
})

t('Multiple statements', async() =>
  [2, await sql.unsafe(`
    select 1 as x;
    select 2 as a;
  `).then(([, [x]]) => x.a)]
)

t('throws correct error when authentication fails', async() => {
  const sql = postgres({
    ...options,
    ...login_md5,
    pass: 'wrong'
  })
  return ['28P01', await sql`select 1`.catch(e => e.code)]
})

t('notice works', async() => {
  let notice
  const log = console.log
  console.log = function(x) {
    notice = x
  }

  const sql = postgres(options)

  await sql`create table if not exists users()`
  await sql`create table if not exists users()`

  console.log = log

  return ['NOTICE', notice.severity]
})

t('notice hook works', async() => {
  let notice
  const sql = postgres({
    ...options,
    onnotice: x => notice = x
  })

  await sql`create table if not exists users()`
  await sql`create table if not exists users()`

  return ['NOTICE', notice.severity]
})

t('bytea serializes and parses', async() => {
  const buf = Buffer.from('wat')

  await sql`create table test (x bytea)`
  await sql`insert into test values (${ buf })`

  return [
    buf.toString(),
    (await sql`select x from test`)[0].x.toString(),
    await sql`drop table test`
  ]
})

t('forEach works', async() => {
  let result
  await sql`select 1 as x`.forEach(({ x }) => result = x)
  return [1, result]
})

t('forEach returns empty array', async() => {
  return [0, (await sql`select 1 as x`.forEach(() => { /* noop */ })).length]
})

t('Cursor works', async() => {
  const order = []
  await sql`select 1 as x union select 2 as x`.cursor(async([x]) => {
    order.push(x.x + 'a')
    await delay(100)
    order.push(x.x + 'b')
  })
  return ['1a1b2a2b', order.join('')]
})

t('Unsafe cursor works', async() => {
  const order = []
  await sql.unsafe('select 1 as x union select 2 as x').cursor(async([x]) => {
    order.push(x.x + 'a')
    await delay(100)
    order.push(x.x + 'b')
  })
  return ['1a1b2a2b', order.join('')]
})

t('Cursor custom n works', async() => {
  const order = []
  await sql`select * from generate_series(1,20)`.cursor(10, async(x) => {
    order.push(x.length)
  })
  return ['10,10', order.join(',')]
})

t('Cursor custom with rest n works', async() => {
  const order = []
  await sql`select * from generate_series(1,20)`.cursor(11, async(x) => {
    order.push(x.length)
  })
  return ['11,9', order.join(',')]
})

t('Cursor custom with less results than batch size works', async() => {
  const order = []
  await sql`select * from generate_series(1,20)`.cursor(21, async(x) => {
    order.push(x.length)
  })
  return ['20', order.join(',')]
})

t('Cursor cancel works', async() => {
  let result
  await sql`select * from generate_series(1,10) as x`.cursor(async([{ x }]) => {
    result = x
    return sql.CLOSE
  })
  return [1, result]
})

t('Cursor throw works', async() => {
  const order = []
  await sql`select 1 as x union select 2 as x`.cursor(async([x]) => {
    order.push(x.x + 'a')
    await delay(100)
    throw new Error('watty')
  }).catch(() => order.push('err'))
  return ['1aerr', order.join('')]
})

t('Cursor error works', async() => [
  '42601',
  await sql`wat`.cursor(() => { /* noop */ }).catch((err) => err.code)
])

t('Multiple Cursors', { timeout: 2 }, async() => {
  const result = []
  const xs = await sql.begin(async sql => [
    await sql`select 1 as cursor, x from generate_series(1,4) as x`.cursor(async ([row]) => {
      result.push(row.x)
      await new Promise(r => setTimeout(r, 200))
    }),
    await sql`select 2 as cursor, x from generate_series(101,104) as x`.cursor(async ([row]) => {
      result.push(row.x)
      await new Promise(r => setTimeout(r, 100))
    })
  ])

  return ['1,2,3,4,101,102,103,104', result.join(',')]
})

t('Cursor as async iterator', async() => {
  const order = []
  for await (const [x] of sql`select generate_series(1,2) as x;`.cursor()) {
    order.push(x.x + 'a')
    await delay(100)
    order.push(x.x + 'b')
  }

  return ['1a1b2a2b', order.join('')]
})

t('Transform row', async() => {
  const sql = postgres({
    ...options,
    transform: { row: () => 1 }
  })

  return [1, (await sql`select 'wat'`)[0]]
})

t('Transform row forEach', async() => {
  let result
  const sql = postgres({
    ...options,
    transform: { row: () => 1 }
  })

  await sql`select 1`.forEach(x => result = x)

  return [1, result]
})

t('Transform value', async() => {
  const sql = postgres({
    ...options,
    transform: { value: () => 1 }
  })

  return [1, (await sql`select 'wat' as x`)[0].x]
})

t('Transform columns from', async() => {
  const sql = postgres({ ...options, transform: { column: { to: postgres.fromCamel, from: postgres.toCamel } } })
  await sql`create table test (a_test int, b_test text)`
  await sql`insert into test ${ sql([{ aTest: 1, bTest: 1 }]) }`
  await sql`update test set ${ sql({ aTest: 2, bTest: 2 }) }`
  return [
    2,
    (await sql`select ${ sql('aTest', 'bTest') } from test`)[0].aTest,
    await sql`drop table test`
  ]
})

t('Unix socket', async() => {
  const sql = postgres({
    ...options,
    host: '/tmp'
  })

  return [1, (await sql`select 1 as x`)[0].x]
})

t('Big result', async() => {
  return [100000, (await sql`select * from generate_series(1, 100000)`).count]
})

t('Debug works', async() => {
  let result
  const sql = postgres({
    ...options,
    debug: (connection_id, str) => result = str
  })

  await sql`select 1`

  return ['select 1', result]
})

t('bigint is returned as String', async() => [
  'string',
  typeof (await sql`select 9223372036854777 as x`)[0].x
])

t('int is returned as Number', async() => [
  'number',
  typeof (await sql`select 123 as x`)[0].x
])

t('numeric is returned as string', async() => [
  'string',
  typeof (await sql`select 1.2 as x`)[0].x
])

t('Async stack trace', async() => {
  const sql = postgres({ ...options, debug: false })
  return [
    parseInt(new Error().stack.split('\n')[1].match(':([0-9]+):')[1]) + 1,
    parseInt(await sql`error`.catch(x => x.stack.split('\n').pop().match(':([0-9]+):')[1]))
  ]
})

t('Debug has long async stack trace', async() => {
  const sql = postgres({ ...options, debug: true })

  return [
    'watyo',
    await yo().catch(x => x.stack.match(/wat|yo/g).join(''))
  ]

  function yo() {
    return wat()
  }

  function wat() {
    return sql`error`
  }
})

t('Error contains query string', async() => [
  'selec 1',
  (await sql`selec 1`.catch(err => err.query))
])

t('Error contains query serialized parameters', async() => [
  1,
  (await sql`selec ${ 1 }`.catch(err => err.parameters[0]))
])

t('Error contains query raw parameters', async() => [
  1,
  (await sql`selec ${ 1 }`.catch(err => err.args[0]))
])

t('Query and parameters on errorare not enumerable if debug is not set', async() => {
  const sql = postgres({ ...options, debug: false })

  return [
    false,
    (await sql`selec ${ 1 }`.catch(err => err.propertyIsEnumerable('parameters') || err.propertyIsEnumerable('query')))
  ]
})

t('Query and parameters are enumerable if debug is set', async() => {
  const sql = postgres({ ...options, debug: true })

  return [
    true,
    (await sql`selec ${ 1 }`.catch(err => err.propertyIsEnumerable('parameters') && err.propertyIsEnumerable('query')))
  ]
})

t('connect_timeout works', { timeout: 20 }, async() => {
  const connect_timeout = 0.2
  const server = net.createServer()
  server.listen()
  const sql = postgres({ port: server.address().port, host: '127.0.0.1', connect_timeout })
  const start = Date.now()
  let end
  await sql`select 1`.catch((e) => {
    if (e.code !== 'CONNECT_TIMEOUT')
      throw e
    end = Date.now()
  })
  server.close()
  return [connect_timeout, Math.floor((end - start) / 100) / 10]
})

t('connect_timeout throws proper error', async() => [
  'CONNECT_TIMEOUT',
  await postgres({
    ...options,
    ...login_scram,
    connect_timeout: 0.001
  })`select 1`.catch(e => e.code)
])

t('requests works after single connect_timeout', async() => {
  let first = true

  const sql = postgres({
    ...options,
    ...login_scram,
    connect_timeout: { valueOf() { return first ? (first = false, 0.001) : 1 } }
  })

  return [
    'CONNECT_TIMEOUT,,1',
    [
      await sql`select 1 as x`.then(() => 'success', x => x.code),
      await delay(10),
      (await sql`select 1 as x`)[0].x
    ].join(',')
  ]
})

t('Postgres errors are of type PostgresError', async() =>
  [true, (await sql`bad keyword`.catch(e => e)) instanceof sql.PostgresError]
)

t('Result has columns spec', async() =>
  ['x', (await sql`select 1 as x`).columns[0].name]
)

t('forEach has result as second argument', async() => {
  let x
  await sql`select 1 as x`.forEach((_, result) => x = result)
  return ['x', x.columns[0].name]
})

t('Result as arrays', async() => {
  const sql = postgres({
    ...options,
    transform: {
      row: x => Object.values(x)
    }
  })

  return ['1,2', (await sql`select 1 as a, 2 as b`)[0].join(',')]
})

t('Insert empty array', async() => {
  await sql`create table tester (ints int[])`
  return [
    Array.isArray((await sql`insert into tester (ints) values (${ sql.array([]) }) returning *`)[0].ints),
    true,
    await sql`drop table tester`
  ]
})

t('Insert array in sql()', async() => {
  await sql`create table tester (ints int[])`
  return [
    Array.isArray((await sql`insert into tester ${ sql({ ints: sql.array([]) }) } returning *`)[0].ints),
    true,
    await sql`drop table tester`
  ]
})

t('Automatically creates prepared statements', async() => {
  const sql = postgres(options)
  const result = await sql`select * from pg_prepared_statements`
  return [true, result.some(x => x.name = result.statement.name)]
})

t('no_prepare: true disables prepared statements (deprecated)', async() => {
  const sql = postgres({ ...options, no_prepare: true })
  const result = await sql`select * from pg_prepared_statements`
  return [false, result.some(x => x.name = result.statement.name)]
})

t('prepare: false disables prepared statements', async() => {
  const sql = postgres({ ...options, prepare: false })
  const result = await sql`select * from pg_prepared_statements`
  return [false, result.some(x => x.name = result.statement.name)]
})

t('prepare: true enables prepared statements', async() => {
  const sql = postgres({ ...options, prepare: true })
  const result = await sql`select * from pg_prepared_statements`
  return [true, result.some(x => x.name = result.statement.name)]
})

t('prepares unsafe query when "prepare" option is true', async() => {
  const sql = postgres({ ...options, prepare: true })
  const result = await sql.unsafe('select * from pg_prepared_statements where name <> $1', ['bla'], { prepare: true })
  return [true, result.some(x => x.name = result.statement.name)]
})

t('does not prepare unsafe query by default', async() => {
  const sql = postgres({ ...options, prepare: true })
  const result = await sql.unsafe('select * from pg_prepared_statements where name <> $1', ['bla'])
  return [false, result.some(x => x.name = result.statement.name)]
})

t('Recreate prepared statements on transformAssignedExpr error', async() => {
  const insert = () => sql`insert into test (name) values (${ '1' }) returning name`
  await sql`create table test (name text)`
  await insert()
  await sql`alter table test alter column name type int using name::integer`
  return [
    1,
    (await insert())[0].name,
    await sql`drop table test`
  ]
})

t('Recreate prepared statements on RevalidateCachedQuery error', async() => {
  const select = () => sql`select name from test`
  await sql`create table test (name text)`
  await sql`insert into test values ('1')`
  await select()
  await sql`alter table test alter column name type int using name::integer`
  return [
    1,
    (await select())[0].name,
    await sql`drop table test`
  ]
})


t('Catches connection config errors', async() => {
  const sql = postgres({ ...options, user: { toString: () => { throw new Error('wat') } }, database: 'prut' })

  return [
    'wat',
    await sql`select 1`.catch((e) => e.message)
  ]
})

t('Catches connection config errors with end', async() => {
  const sql = postgres({ ...options, user: { toString: () => { throw new Error('wat') } }, database: 'prut' })

  return [
    'wat',
    await sql`select 1`.catch((e) => e.message),
    await sql.end()
  ]
})

t('Catches query format errors', async() => [
  'wat',
  await sql.unsafe({ toString: () => { throw new Error('wat') } }).catch((e) => e.message)
])

t('Multiple hosts', {
  timeout: 10
}, async() => {
  const s1 = postgres({ idle_timeout })
      , s2 = postgres({ idle_timeout, port: 5433 })
      , sql = postgres('postgres://localhost:5432,localhost:5433', { idle_timeout, max: 1 })
      , result = []

  const x1 = await sql`select 1`
  result.push((await sql`select setting as x from pg_settings where name = 'port'`)[0].x)
  await s1`select pg_terminate_backend(${ x1.state.pid }::int)`
  await delay(100)

  const x2 = await sql`select 1`
  result.push((await sql`select setting as x from pg_settings where name = 'port'`)[0].x)
  await s2`select pg_terminate_backend(${ x2.state.pid }::int)`
  await delay(100)

  result.push((await sql`select setting as x from pg_settings where name = 'port'`)[0].x)

  return ['5432,5433,5432', result.join(',')]
})

t('Escaping supports schemas and tables', async() => {
  await sql`create schema a`
  await sql`create table a.b (c int)`
  await sql`insert into a.b (c) values (1)`
  return [
    1,
    (await sql`select ${ sql('a.b.c') } from a.b`)[0].c,
    await sql`drop table a.b`,
    await sql`drop schema a`
  ]
})

t('Raw method returns rows as arrays', async() => {
  const [x] = await sql`select 1`.raw()
  return [
    Array.isArray(x),
    true
  ]
})

t('Raw method returns values unparsed as Buffer', async() => {
  const [[x]] = await sql`select 1`.raw()
  return [
    x instanceof Uint8Array,
    true
  ]
})

t('Copy read works', async() => {
  const result = []

  await sql`create table test (x int)`
  await sql`insert into test select * from generate_series(1,10)`
  const readable = await sql`copy test to stdout`.readable()
  readable.on('data', x => result.push(x))
  await new Promise(r => readable.on('end', r))

  return [
    result.length,
    10,
    await sql`drop table test`
  ]
})

t('Copy write works', { timeout: 2 }, async() => {
  await sql`create table test (x int)`
  const writable = await sql`copy test from stdin`.writable()

  writable.write('1\n')
  writable.write('1\n')
  writable.end()

  await new Promise(r => writable.on('finish', r))

  return [
    (await sql`select 1 from test`).length,
    2,
    await sql`drop table test`
  ]
})

t('Copy write as first works', async() => {
  await sql`create table test (x int)`
  const first = postgres(options)
  const writable = await first`COPY test FROM STDIN WITH(FORMAT csv, HEADER false, DELIMITER ',')`.writable()
  writable.write('1\n')
  writable.write('1\n')
  writable.end()

  await new Promise(r => writable.on('finish', r))

  return [
    (await sql`select 1 from test`).length,
    2,
    await sql`drop table test`
  ]
})


nt('Copy from file works', async() => {
  await sql`create table test (x int, y int, z int)`
  await new Promise(async r => fs
    .createReadStream(rel('copy.csv'))
    .pipe(await sql`copy test from stdin`.writable())
    .on('finish', r)
  )

  return [
    JSON.stringify(await sql`select * from test`),
    '[{"x":1,"y":2,"z":3},{"x":4,"y":5,"z":6}]',
    await sql`drop table test`
  ]
})

t('Copy from works in transaction', async() => {
  await sql`create table test(x int)`
  const xs = await sql.begin(async sql => {
    (await sql`copy test from stdin`.writable()).end('1\n2')
    await delay(20)
    return sql`select 1 from test`
  })

  return [
    xs.length,
    2,
    await sql`drop table test`
  ]
})

nt('Copy from abort works', async() => {
  const sql = postgres(options)
  const readable = fs.createReadStream(rel('copy.csv'))

  await sql`create table test (x int, y int, z int)`
  await sql`TRUNCATE TABLE test`

  const writable = await sql`COPY test FROM STDIN`.writable()

  let aborted

  readable
    .pipe(writable)
    .on('error', (err) => aborted = err)

  writable.destroy(new Error('abort'))
  await sql.end()

  return [
    'abort',
    aborted.message,
    await postgres(options)`drop table test`
  ]
})

t('multiple queries before connect', async() => {
  const sql = postgres({ ...options, max: 2 })
  const xs = await Promise.all([
    sql`select 1 as x`,
    sql`select 2 as x`,
    sql`select 3 as x`,
    sql`select 4 as x`
  ])

  return [
    '1,2,3,4',
    xs.map(x => x[0].x).join()
  ]
})

t('subscribe', { timeout: 2 }, async() => {
  const sql = postgres({
    database: 'postgres_js_test',
    publications: 'alltables',
    fetch_types: false
  })

  await sql.unsafe('create publication alltables for all tables')

  const result = []

  await sql.subscribe('*', (row, info) =>
    result.push(info.command, row.name || row.id)
  )

  await sql`
    create table test (
      id serial primary key,
      name text
    )
  `
  await sql`insert into test (name) values ('Murray')`
  await sql`update test set name = 'Rothbard'`
  await sql`delete from test`
  await delay(100)
  return [
    'insert,Murray,update,Rothbard,delete,1',
    result.join(','),
    await sql`drop table test`,
    await sql`drop publication alltables`,
    await sql.end()
  ]
})

t('Execute works', async() => {
  const result = await new Promise((resolve) => {
    const sql = postgres({ ...options, fetch_types: false, debug (id, query)  {
      resolve(query)
    }})
    sql`select 1`.execute()
  })

  return [result, 'select 1']
})

t('Cancel running query works', async() => {
  const query = sql`select pg_sleep(2)`
  setTimeout(() => query.cancel(), 50)
  const error = await query.catch(x => x)
  return ['57014', error.code]
})

t('Cancel piped query works', async() => {
  await sql`select 1`
  const last = sql`select pg_sleep(0.2)`.execute()
  const query = sql`select pg_sleep(2) as dig`
  setTimeout(() => query.cancel(), 100)
  const error = await query.catch(x => x)
  await last
  return ['57014', error.code]
})

t('Cancel queued query works', async() => {
  const tx = sql.begin(sql => sql`select pg_sleep(0.2) as hej, 'hejsa'`)
  const query = sql`select pg_sleep(2) as nej`
  setTimeout(() => query.cancel(), 50)
  const error = await query.catch(x => x)
  await tx
  return ['57014', error.code]
})

t('Fragments', async() => [
  1,
  (await sql`
    ${ sql`select` } 1 as x
  `)[0].x
])

t('Result becomes array', async() => [
  true,
  (await sql`select 1`).slice() instanceof Array
])

t('Describe', async() => {
  const type = (await sql`select ${ 1 }::int as x`.describe()).types[0]
  return [23, type]
})

t('Describe a statement', async() => {
  await sql`create table tester (name text, age int)`
  const r = await sql`select name, age from tester where name like $1 and age > $2`.describe()
  return [
    '25,23/name:25,age:23',
    `${ r.types.join(',') }/${ r.columns.map(c => `${c.name}:${c.type}`).join(',') }`,
    await sql`drop table tester`
  ]
})

t('Describe a statement without parameters', async() => {
  await sql`create table tester (name text, age int)`
  const r = await sql`select name, age from tester`.describe()
  return [
    '0,2',
    `${ r.types.length },${ r.columns.length }`,
    await sql`drop table tester`
  ]
})

t('Describe a statement without columns', async() => {
  await sql`create table tester (name text, age int)`
  const r = await sql`insert into tester (name, age) values ($1, $2)`.describe()
  return [
    '2,0',
    `${ r.types.length },${ r.columns.length }`,
    await sql`drop table tester`
  ]
})

nt('Large object', async() => {
  const file = rel('index.js')
      , md5 = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')

  const lo = await sql.largeObject()
  await new Promise(async r => fs.createReadStream(file).pipe(await lo.writable()).on('finish', r))
  await lo.seek(0)

  const out = crypto.createHash('md5')
  await new Promise(r => lo.readable().then(x => x.on('data', x => out.update(x)).on('end', r)))

  return [
    md5,
    out.digest('hex'),
    await lo.close()
  ]
})

t('Catches type serialize errors', async() => {
  const sql = postgres({
    idle_timeout,
    types: {
      text: {
        from: 25,
        to: 25,
        parse: x => x,
        serialize: () => { throw new Error('watSerialize') }
      }
    }
  })

  return [
    'watSerialize',
    (await sql`select ${ 'wat' }`.catch(e => e.message))
  ]
})

t('Catches type parse errors', async() => {
  const sql = postgres({
    idle_timeout,
    types: {
      text: {
        from: 25,
        to: 25,
        parse: () => { throw new Error('watParse') },
        serialize: x => x
      }
    }
  })

  return [
    'watParse',
    (await sql`select 'wat'`.catch(e => e.message))
  ]
})

t('Catches type serialize errors in transactions', async() => {
  const sql = postgres({
    idle_timeout,
    types: {
      text: {
        from: 25,
        to: 25,
        parse: x => x,
        serialize: () => { throw new Error('watSerialize') }
      }
    }
  })

  return [
    'watSerialize',
    (await sql.begin(sql => (
      sql`select 1`,
      sql`select ${ 'wat' }`
    )).catch(e => e.message))
  ]
})

t('Catches type parse errors in transactions', async() => {
  const sql = postgres({
    idle_timeout,
    types: {
      text: {
        from: 25,
        to: 25,
        parse: () => { throw new Error('watParse') },
        serialize: x => x
      }
    }
  })

  return [
    'watParse',
    (await sql.begin(sql => (
      sql`select 1`,
      sql`select 'wat'`
    )).catch(e => e.message))
  ]
})
