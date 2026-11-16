---
title: Loops
type: subtopic
category: Python
parent: Module 1 · The basics
description: A loop runs the same block of code again and again.
tags: [python, loops, for, while]
lesson: true
order: 10
status: draft
updated: 2026-11-16
---

```kv-lab
#! title: Watch a loop go round
total = 0
for i in range(1, 5):
    total = total + i
    print("added", i, "total is", total)
print("final:", total)
```

Click **Start again**, then **Next step**. Each time round, the tag `i` moves to the next number and `total` moves to a new value. Change `range(1, 5)` to `range(1, 11)`.

## See

A **loop** runs the same block again and again.

### for: repeat for each item

```python
for i in range(1, 5):
    print(i)
```

`range(1, 5)` produces 1, 2, 3, 4 — it **stops before** 5. Each time round, Python moves the name `i` to the next value and runs the indented block.

- `range(5)` → 0, 1, 2, 3, 4
- `range(2, 10, 2)` → 2, 4, 6, 8 (the third number is the step)

### while: repeat while a condition is True

```python
count = 3
while count > 0:
    print(count)
    count = count - 1
```

Python checks the condition **before** each round. When it becomes `False`, the loop ends.

> [!analogy] Laps of a track
> A `for` loop is "run 4 laps". A `while` loop is "keep running until you're tired". With `while`, something inside the loop must eventually make you tired — or you run forever.

> [!mistake] Common mistakes
> - Forgetting to change the variable in a `while` loop → it never ends (the lab stops it after 600 steps).
> - Expecting `range(1, 5)` to include 5. It doesn't.

## Play

```kv-predict
for i in range(3):
    print(i)
---
? What prints?
+ 0 1 2
- 1 2 3
- 0 1 2 3
> `range(3)` starts at **0** and stops **before** 3.
```

```kv-lab
#! title: Countdown with while
count = 3
while count > 0:
    print(count)
    count = count - 1
print("Lift off!")
```

Challenge: delete the line `count = count - 1` and see what the lab tells you.

## Remember

> [!recap] In one breath
> `for` repeats once for each item, like each number in `range()`. `while` repeats as long as a condition is `True`. `range(a, b)` stops **before** b. A `while` loop needs something inside it that eventually makes the condition `False`.

- `break` leaves a loop early; `continue` skips to the next round.

## Explain

> [!interview] "When do you use for vs while?"
> *"I use `for` when I know what I'm looping over — a range of numbers or the items in a list. I use `while` when I loop until something happens and don't know the count in advance, like reading input until the user types 'quit'. With `while` I make sure the condition can become False so it doesn't loop forever."*

**Follow-up:** *"What does `range(10, 0, -2)` give?"* — 10, 8, 6, 4, 2.
