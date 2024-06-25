# 3.5.x
- Simple loops are now optimized by default
	- This will optimize loops like `for (let i = 1; i <= 10; i++) {}` into `for i = 1, 10 do end`
- Fixed emit around `a.b()` and `a[b]()` in certain conditions
- Fix an issue where .d.ts changes in watch mode would not register for other files
- Updated `@roblox-ts/luau-ast` to latest to fix emit issues
	- Changes listed at https://github.com/roblox-ts/luau-ast/pull/483

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
