/**
 * @jest-environment jsdom
 */

import * as isModule from '../src/is';
import { normalize } from '../src/normalize';
import { addNonEnumerableProperty } from '../src/object';
import * as stacktraceModule from '../src/stacktrace';

describe('normalize()', () => {
  describe('acts as a pass-through for simple-cases', () => {
    test('return same value for simple input', () => {
      expect(normalize('foo')).toEqual('foo');
      expect(normalize(42)).toEqual(42);
      expect(normalize(true)).toEqual(true);
      expect(normalize(null)).toEqual(null);
    });

    test('return same object or arrays for referenced inputs', () => {
      expect(normalize({ foo: 'bar' })).toEqual({ foo: 'bar' });
      expect(normalize([42])).toEqual([42]);
    });
  });

  describe('convertToPlainObject()', () => {
    test('extracts extra properties from error objects', () => {
      const obj = new Error('Wubba Lubba Dub Dub') as any;
      obj.reason = new TypeError("I'm pickle Riiick!");
      obj.extra = 'some extra prop';

      obj.stack = 'x';
      obj.reason.stack = 'x';

      // IE 10/11
      delete obj.description;
      delete obj.reason.description;

      expect(normalize(obj)).toEqual({
        message: 'Wubba Lubba Dub Dub',
        name: 'Error',
        stack: 'x',
        reason: {
          message: "I'm pickle Riiick!",
          name: 'TypeError',
          stack: 'x',
        },
        extra: 'some extra prop',
      });
    });

    describe('extracts data from `Event` objects', () => {
      const isElement = jest.spyOn(isModule, 'isElement').mockReturnValue(true);
      const getAttribute = () => undefined;

      const parkElement = { tagName: 'PARK', getAttribute };
      const treeElement = { tagName: 'TREE', parentNode: parkElement, getAttribute };
      const squirrelElement = { tagName: 'SQUIRREL', parentNode: treeElement, getAttribute };

      const chaseEvent = new Event('chase');
      Object.defineProperty(chaseEvent, 'target', { value: squirrelElement });
      Object.defineProperty(chaseEvent, 'currentTarget', { value: parkElement });
      Object.defineProperty(chaseEvent, 'wagging', { value: true, enumerable: false });

      expect(normalize(chaseEvent)).toEqual({
        currentTarget: 'park',
        isTrusted: false,
        target: 'park > tree > squirrel',
        type: 'chase',
        // notice that `wagging` isn't included because it's not enumerable and not one of the ones we specifically extract
      });

      isElement.mockRestore();
    });
  });

  describe('decycles cyclical structures', () => {
    test('circular objects', () => {
      const obj = { name: 'Alice' } as any;
      obj.self = obj;
      expect(normalize(obj)).toEqual({ name: 'Alice', self: '[Circular ~]' });
    });

    test('circular objects with intermediaries', () => {
      const obj = { name: 'Alice' } as any;
      obj.identity = { self: obj };
      expect(normalize(obj)).toEqual({ name: 'Alice', identity: { self: '[Circular ~]' } });
    });

    test('deep circular objects', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } } as any;
      obj.child.self = obj.child;
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        child: { name: 'Bob', self: '[Circular ~]' },
      });
    });

    test('deep circular objects with intermediaries', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } } as any;
      obj.child.identity = { self: obj.child };
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        child: { name: 'Bob', identity: { self: '[Circular ~]' } },
      });
    });

    test('circular objects in an array', () => {
      const obj = { name: 'Alice' } as any;
      obj.self = [obj, obj];
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        self: ['[Circular ~]', '[Circular ~]'],
      });
    });

    test('deep circular objects in an array', () => {
      const obj = {
        name: 'Alice',
        children: [{ name: 'Bob' }, { name: 'Eve' }],
      } as any;
      obj.children[0].self = obj.children[0];
      obj.children[1].self = obj.children[1];
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        children: [
          { name: 'Bob', self: '[Circular ~]' },
          { name: 'Eve', self: '[Circular ~]' },
        ],
      });
    });

    test('circular arrays', () => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      const obj: object[] = [];
      obj.push(obj);
      obj.push(obj);
      expect(normalize(obj)).toEqual(['[Circular ~]', '[Circular ~]']);
    });

    test('circular arrays with intermediaries', () => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      const obj: object[] = [];
      obj.push({ name: 'Alice', self: obj });
      obj.push({ name: 'Bob', self: obj });
      expect(normalize(obj)).toEqual([
        { name: 'Alice', self: '[Circular ~]' },
        { name: 'Bob', self: '[Circular ~]' },
      ]);
    });

    test('repeated objects in objects', () => {
      const obj = {} as any;
      const alice = { name: 'Alice' };
      obj.alice1 = alice;
      obj.alice2 = alice;
      expect(normalize(obj)).toEqual({
        alice1: { name: 'Alice' },
        alice2: { name: 'Alice' },
      });
    });

    test('repeated objects in arrays', () => {
      const alice = { name: 'Alice' };
      const obj = [alice, alice];
      expect(normalize(obj)).toEqual([{ name: 'Alice' }, { name: 'Alice' }]);
    });

    test('error objects with circular references', () => {
      const obj = new Error('Wubba Lubba Dub Dub') as any;
      obj.reason = obj;

      obj.stack = 'x';
      obj.reason.stack = 'x';

      // IE 10/11
      delete obj.description;

      expect(normalize(obj)).toEqual({
        message: 'Wubba Lubba Dub Dub',
        name: 'Error',
        stack: 'x',
        reason: '[Circular ~]',
      });
    });
  });

  describe('dont mutate and skip non-enumerables', () => {
    test('simple object', () => {
      const circular = {
        foo: 1,
      } as any;
      circular.bar = circular;

      const normalized = normalize(circular);
      expect(normalized).toEqual({
        foo: 1,
        bar: '[Circular ~]',
      });

      expect(circular.bar).toBe(circular);
      expect(normalized).not.toBe(circular);
    });

    test('complex object', () => {
      const circular = {
        foo: 1,
      } as any;
      circular.bar = [
        {
          baz: circular,
        },
        circular,
      ];
      circular.qux = circular.bar[0].baz;

      const normalized = normalize(circular);
      expect(normalized).toEqual({
        bar: [
          {
            baz: '[Circular ~]',
          },
          '[Circular ~]',
        ],
        foo: 1,
        qux: '[Circular ~]',
      });

      expect(circular.bar[0].baz).toBe(circular);
      expect(circular.bar[1]).toBe(circular);
      expect(circular.qux).toBe(circular.bar[0].baz);
      expect(normalized).not.toBe(circular);
    });

    test('object with non-enumerable properties', () => {
      const circular = {
        foo: 1,
      } as any;
      circular.bar = circular;
      circular.baz = {
        one: 1337,
      };
      Object.defineProperty(circular, 'qux', {
        enumerable: true,
        value: circular,
      });
      Object.defineProperty(circular, 'quaz', {
        enumerable: false,
        value: circular,
      });
      Object.defineProperty(circular.baz, 'two', {
        enumerable: false,
        value: circular,
      });

      expect(normalize(circular)).toEqual({
        bar: '[Circular ~]',
        baz: {
          one: 1337,
        },
        foo: 1,
        qux: '[Circular ~]',
      });
    });
  });

  describe('calls toJSON if implemented', () => {
    test('primitive values', () => {
      const a = new Number(1) as any;
      a.toJSON = () => 10;
      const b = new String('2') as any;
      b.toJSON = () => '20';
      expect(normalize(a)).toEqual(10);
      expect(normalize(b)).toEqual('20');
    });

    test('objects, arrays and classes', () => {
      const a = Object.create({});
      a.toJSON = () => 1;
      function B(): void {
        /* no-empty */
      }
      B.prototype.toJSON = () => 2;
      const c: any = [];
      c.toJSON = () => 3;
      // @ts-ignore target lacks a construct signature
      expect(normalize([{ a }, { b: new B() }, c])).toEqual([{ a: 1 }, { b: 2 }, 3]);
    });
  });

  describe('changes unserializeable/global values/classes to its string representation', () => {
    test('primitive values', () => {
      expect(normalize(undefined)).toEqual('[undefined]');
      expect(normalize(NaN)).toEqual('[NaN]');
      expect(normalize(Symbol('dogs'))).toEqual('[Symbol(dogs)]');
      // `BigInt` doesn't exist in Node 8
      if (Number(process.versions.node.split('.')[0]) >= 10) {
        expect(normalize(BigInt(1121201212312012))).toEqual('[BigInt: 1121201212312012]');
      }
    });

    test('functions', () => {
      expect(
        normalize(() => {
          /* no-empty */
        }),
      ).toEqual('[Function: <anonymous>]');
      const foo = () => {
        /* no-empty */
      };
      expect(normalize(foo)).toEqual('[Function: foo]');
    });

    test('primitive values in objects/arrays', () => {
      expect(normalize(['foo', 42, undefined, NaN])).toEqual(['foo', 42, '[undefined]', '[NaN]']);
      expect(
        normalize({
          foo: 42,
          bar: undefined,
          baz: NaN,
        }),
      ).toEqual({
        foo: 42,
        bar: '[undefined]',
        baz: '[NaN]',
      });
    });

    test('primitive values in deep objects/arrays', () => {
      expect(normalize(['foo', 42, [[undefined]], [NaN]])).toEqual(['foo', 42, [['[undefined]']], ['[NaN]']]);
      expect(
        normalize({
          foo: 42,
          bar: {
            baz: {
              quz: undefined,
            },
          },
          wat: {
            no: NaN,
          },
        }),
      ).toEqual({
        foo: 42,
        bar: {
          baz: {
            quz: '[undefined]',
          },
        },
        wat: {
          no: '[NaN]',
        },
      });
    });

    test('known Classes like Reacts SyntheticEvents', () => {
      const obj = {
        foo: {
          nativeEvent: 'wat',
          preventDefault: 'wat',
          stopPropagation: 'wat',
        },
      };
      expect(normalize(obj)).toEqual({
        foo: '[SyntheticEvent]',
      });
    });
  });

  describe('can limit object to depth', () => {
    test('single level', () => {
      const obj = {
        foo: [],
      };

      expect(normalize(obj, 1)).toEqual({
        foo: '[Array]',
      });
    });

    test('two levels', () => {
      const obj = {
        foo: [1, 2, []],
      };

      expect(normalize(obj, 2)).toEqual({
        foo: [1, 2, '[Array]'],
      });
    });

    test('multiple levels with various inputs', () => {
      const obj = {
        foo: {
          bar: {
            baz: 1,
            qux: [
              {
                rick: 'morty',
              },
            ],
          },
        },
        bar: 1,
        baz: [
          {
            something: 'else',
            fn: () => {
              /* no-empty */
            },
          },
        ],
      };

      expect(normalize(obj, 3)).toEqual({
        bar: 1,
        baz: [
          {
            something: 'else',
            fn: '[Function: fn]',
          },
        ],
        foo: {
          bar: {
            baz: 1,
            qux: '[Array]',
          },
        },
      });
    });
  });

  describe('can limit max properties', () => {
    test('object', () => {
      const obj = {
        nope: 'here',
        foo: {
          one: 1,
          two: 2,
          three: 3,
          four: 4,
          five: 5,
          six: 6,
          seven: 7,
        },
        after: 'more',
      };

      expect(normalize(obj, 10, 5)).toEqual({
        nope: 'here',
        foo: {
          one: 1,
          two: 2,
          three: 3,
          four: 4,
          five: 5,
          six: '[MaxProperties ~]',
        },
        after: 'more',
      });
    });

    test('array', () => {
      const obj = {
        nope: 'here',
        foo: new Array(100).fill('s'),
        after: 'more',
      };

      expect(normalize(obj, 10, 5)).toEqual({
        nope: 'here',
        foo: ['s', 's', 's', 's', 's', '[MaxProperties ~]'],
        after: 'more',
      });
    });
  });

  describe('handles serialization errors', () => {
    test('restricts effect of error to problematic node', () => {
      jest.spyOn(stacktraceModule, 'getFunctionName').mockImplementationOnce(() => {
        throw new Error('Nope');
      });

      expect(normalize({ dogs: 'are great!', someFunc: () => {} })).toEqual({
        dogs: 'are great!',
        someFunc: '**non-serializable** (Error: Nope)',
      });
    });
  });

  test('normalizes value on every iteration of decycle and takes care of things like Reacts SyntheticEvents', () => {
    const obj = {
      foo: {
        nativeEvent: 'wat',
        preventDefault: 'wat',
        stopPropagation: 'wat',
      },
      baz: NaN,
      qux: function qux(): void {
        /* no-empty */
      },
    };
    const result = normalize(obj);
    expect(result).toEqual({
      foo: '[SyntheticEvent]',
      baz: '[NaN]',
      qux: '[Function: qux]',
    });
  });

  describe('skips normalizing objects marked with a non-enumerable property __sentry_skip_normalization__', () => {
    test('by leaving non-serializable values intact', () => {
      const someFun = () => undefined;
      const alreadyNormalizedObj = {
        nan: NaN,
        fun: someFun,
      };

      addNonEnumerableProperty(alreadyNormalizedObj, '__sentry_skip_normalization__', true);

      const result = normalize(alreadyNormalizedObj);
      expect(result).toEqual({
        nan: NaN,
        fun: someFun,
      });
    });

    test('by ignoring normalization depth', () => {
      const alreadyNormalizedObj = {
        three: {
          more: {
            layers: '!',
          },
        },
      };

      addNonEnumerableProperty(alreadyNormalizedObj, '__sentry_skip_normalization__', true);

      const obj = {
        foo: {
          bar: {
            baz: alreadyNormalizedObj,
            boo: {
              bam: {
                pow: 'poof',
              },
            },
          },
        },
      };

      const result = normalize(obj, 4);

      expect(result?.foo?.bar?.baz?.three?.more?.layers).toBe('!');
      expect(result?.foo?.bar?.boo?.bam?.pow).not.toBe('poof');
    });
  });
});
