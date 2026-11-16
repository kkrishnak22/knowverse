---
title: Data types
type: subtopic
category: Python
parent: Module 1 · The basics
description: Every value has a type. The type decides what you can do with the value.
tags: [python, types]
lesson: true
order: 6
status: draft
updated: 2026-11-16
---

```kv-lab
#! title: Every value has a type (and a colour)
count = 3
price = 49.5
city = "Chennai"
is_open = True
nothing = None
print(type(price))
```

Each type gets its own colour in memory. Change `49.5` to `49` and watch the block change from **float** to **int**. Try `city = 3` — the name keeps working, but now points to a different type.

## See

A value's **type** tells Python what kind of thing it is and what you can do with it.

| Type | What it is | Examples |
|---|---|---|
| `int` | whole numbers | `3`, `-12`, `2026` |
| `float` | numbers with a decimal point | `49.5`, `3.0`, `-0.25` |
| `str` | text (a *string* of characters) | `"Chennai"`, `'a'`, `""` |
| `bool` | yes / no | `True`, `False` |
| `NoneType` | "no value" | `None` |

Use `type(value)` to ask Python for a value's type.

> [!analogy] Types are like units
> 5 kg + 3 kg makes sense. 5 kg + "hello" doesn't. Python checks types the same way: `3 + 4` works, `3 + "4"` is a `TypeError`.

### Converting between types

- `int("42")` → 42 (text to whole number)
- `float("4.5")` → 4.5
- `str(20)` → `"20"` (number to text)
- `int(4.9)` → 4 — it **chops off** the decimal part, it doesn't round.

> [!mistake] Common wrong idea
> "`3.0` and `3` are the same thing." They're equal in value (`3.0 == 3` is `True`) but they're different types: `float` and `int`.

## Play

```kv-predict
print(type("20"))
---
? What type is "20"?
- int, because 20 is a number
+ str, because it's in quotes
- float
> Quotes make it a **string**. To use it as a number, convert it: `int("20")`.
```

```kv-predict
print(int(7.9))
---
? What does this print?
- 8
+ 7
- 7.9
> `int()` drops everything after the decimal point. To round, use `round(7.9)`, which gives 8.
```

## Remember

> [!recap] In one breath
> Every value has a type: `int` (whole numbers), `float` (decimals), `str` (text), `bool` (`True`/`False`) and `None`. The type decides what you can do with the value. Convert with `int()`, `float()`, `str()`.

## Explain

> [!interview] "What are Python's basic data types?"
> *"The main built-in ones are int, float, str and bool, plus None for 'no value'. Collections like list, tuple, dict and set come next. Python is dynamically typed, so the type belongs to the value, not the variable — `x = 5` then `x = "five"` is allowed."*

**Follow-up:** *"Is a string mutable?"* — No. Strings are **immutable**: operations like `.upper()` return a **new** string and leave the original unchanged.
