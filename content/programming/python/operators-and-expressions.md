---
title: Operators and expressions
type: subtopic
category: Python
parent: Module 1 · The basics
description: Operators do maths, compare values and combine True and False.
tags: [python, operators]
lesson: true
order: 8
status: draft
updated: 2026-11-16
---

```kv-lab
#! title: Python as a calculator
total = 17
people = 5
each = total // people
left_over = total % people
exact = total / people
print(each, left_over, exact)
print(total > 10 and people < 3)
```

Try `17 // 5` vs `17 / 5`. Change `people` to 2 and watch the `True`/`False` result flip.

## See

An **expression** is anything Python can work out to a value: `2 + 3`, `price * qty`, `age >= 18`.

### Arithmetic

| Operator | Meaning | Example | Result |
|---|---|---|---|
| `+` `-` `*` | add, subtract, multiply | `4 * 3` | `12` |
| `/` | divide (always a float) | `17 / 5` | `3.4` |
| `//` | floor division (whole part) | `17 // 5` | `3` |
| `%` | remainder (*modulo*) | `17 % 5` | `2` |
| `**` | power | `2 ** 3` | `8` |

> [!analogy] Sharing 17 sweets between 5 friends
> Everyone gets `17 // 5` = **3** sweets, and `17 % 5` = **2** are left over.

### Comparison → True or False

`==` equal, `!=` not equal, `<` `>` `<=` `>=`. Note: `=` **assigns**, `==` **compares**.

### Logic

`and` (both true), `or` (at least one true), `not` (flip).

### Order of operations

Brackets first, then `**`, then `* / // %`, then `+ -`, then comparisons, then `not`, `and`, `or`. When unsure, add brackets — they make code clearer anyway.

> [!mistake] Common mistake
> `if x = 5:` is a SyntaxError. Comparing needs **two** equals signs: `if x == 5:`.

## Play

```kv-predict
print(2 + 3 * 4)
---
? What does this print?
- 20
+ 14
- 24
> Multiplication happens before addition: `3 * 4` = 12, then `2 + 12` = **14**. Write `(2 + 3) * 4` if you want 20.
```

```kv-predict
print(10 / 2)
---
? What does this print?
- 5
+ 5.0
- 5.00
> `/` always gives a **float**, even when it divides evenly. Use `//` for a whole-number result.
```

## Remember

> [!recap] In one breath
> `/` gives a float, `//` gives the whole part, `%` gives the remainder, `**` is power. Comparisons give `True`/`False`; combine them with `and`, `or`, `not`. `=` assigns, `==` compares. When in doubt, use brackets.

## Explain

> [!interview] "How do you check if a number is even?"
> *"Use the modulo operator: `n % 2 == 0`. `%` gives the remainder after dividing by 2 — zero means even."*

**Follow-up:** *"What's `-7 // 2`?"* — `-4`. Floor division rounds **down** towards negative infinity, not towards zero.
