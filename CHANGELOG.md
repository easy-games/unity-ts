# 3.6.x
- [`static` blocks](https://www.typescriptlang.org/docs/handbook/2/classes.html#static-blocks-in-classes) are now supported, instead of crashing the compiler.
- Support for Array, Set, Map, Generator and Object destructuring!
	- E.g. `const [a, b, ...c] = array`, `const {a, b, ...rest} = obj;`
	- Note: This is not supported for C# objects, unity data types or any unity Object derived types!

## 2025-07-10
- Fixed bug with `AirshipSingleton` static method calls/member accesses not including an import (and thus erroring) - e.g.
```ts
import TestManager from "./TestManager"; // where TestManager extends AirshipSingleton

export default class Test extends AirshipBehaviour {
	Start(): void {
		TestManager.OnTest.Connect(() => {}); // this would previously not cause an import in Luau
	}
}

```

# 3.5.x
- Simple loops are now optimized by default
	- This will optimize loops like `for (let i = 1; i <= 10; i++) {}` into `for i = 1, 10 do end`
- Fixed emit around `a.b()` and `a[b]()` in certain conditions
- Fix an issue where .d.ts changes in watch mode would not register for other files
- `AirshipBehaviour` now supports arrays of Typescript Enums + AirshipBehaviours
- Updated `@roblox-ts/luau-ast` to latest to fix emit issues
	- Changes listed at https://github.com/roblox-ts/luau-ast/pull/483

## 2025-03-05
- Negative literals (e.g. `@Range(-100, -10)`) should now be acceptable in behaviour macro decorators

## 2025-03-01
- `--publish` added to strip edit-time metadata on game publish

## 2025-02-26
- Added JSDoc generation support

## 2024-10-24
- Added support for inheriting generic components, e.g. `ExampleComponent extends GenericComponent<T>` where `GenericComponent` extends `AirshipBehaviour`

## 2024-09-25
- Added `Instantiate` and `Destroy` macros
- Added `AirshipBehaviour.enabled` setter macro
- Force `gameObject` global to reference `this.gameObject` inside of `AirshipBehaviour`

## 2024-07-03 (3f51ef)
- Added `GetAirshipComponentsInParent`, `GetAirshipComponentInParent` and `GetComponentInParent`

## 2024-07-17 (d9dda7e)
- Added `for-of` iterator for `Transform`

## 2024-08-27
- Fix logical checks for `Object` in cases like `if (this.networkIdentity && this.networkIdentity.netId > 0)`

# 3.4.x
- `AirshipBehaviour` properties now supported in the compiler

### 2024-06-22 (a2cd5af)
- Boolean default properties in `AirshipBehaviour`s fixed.

### 2024-06-20 (b169f56)
- Unity-related generic macros such as `FindObjectsOfType` now support extra parameters

# 3.3.x
- Upgraded to Typescript 5.4
- the unity-ts compiler is now available as a built in compiler for the Airship editor

# 3.2.x
- Flamework is now a built in feature of the unity-ts compiler

# 3.1.x
- Rework for the new project format in Airship
