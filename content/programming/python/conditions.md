---
title: Conditions
type: subtopic
category: Python
parent: Module 1 · The basics
description: if, elif and else let your program choose which lines to run.
tags: [python, conditions, if]
lesson: true
order: 9
status: draft
updated: 2026-11-16
---

```kv-lab
#! title: Watch Python choose a path
marks = 72
if marks >= 90:
    grade = "A"
elif marks >= 60:
    grade = "B"
else:
    grade = "C"
print("Grade:", grade)
```

Click **Start again**, then **Next step** a few times: the highlighted line **jumps** over the branches that don't apply. Change `marks` to 95, then 40.

## See

Until now, every line ran. A **condition** lets the program **choose**.

```python
if condition:
    # runs only when condition is True
elif other_condition:
    # checked only if the ones above were False
else:
    # runs when nothing above was True
```

- Python checks from the **top**, and runs the **first** branch whose condition is `True` — then skips the rest.
- The **colon** `:` and the **indent** (4 spaces) are required. The indented lines are the *block* that belongs to that branch.
- `elif` and `else` are optional.

> [!analogy] A railway junction
> The train (Python) reaches a junction, checks the signal, and takes exactly one track. It never runs on two tracks at once.

> [!mistake] Common mistakes
> - Forgetting the colon: `if marks >= 90` → SyntaxError.
> - Wrong order: checking `marks >= 60` **before** `marks >= 90` means a 95 gets a B, because the first true branch wins.

## Play

```kv-predict
x = 15
if x > 10:
    print("big")
elif x > 5:
    print("medium")
print("done")
---
? What prints?
- big, medium, done
+ big, done
- big
> 15 > 10 is True, so Python runs that branch and **skips** the `elif`, even though 15 > 5 is also true. `print("done")` isn't indented, so it always runs.
```

```kv-lab
#! title: Your turn — even or odd?
n = 7
if n % 2 == 0:
    print(n, "is even")
else:
    print(n, "is odd")
```

## Remember

> [!recap] In one breath
> `if` runs a block only when its condition is `True`. `elif` adds more checks; `else` catches everything left. Python takes the **first** true branch and skips the rest. Colons and indentation are required.

## Explain

> [!interview] "What's the difference between multiple ifs and if/elif?"
> *"With separate `if` statements, every condition is checked and several blocks can run. With `if`/`elif`, Python stops at the first true condition, so at most one block runs. I use elif when the cases are mutually exclusive, like grade bands."*
