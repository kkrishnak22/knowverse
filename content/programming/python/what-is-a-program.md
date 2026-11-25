---
title: What is a program?
type: subtopic
category: Python
parent: Module 0 · Before you code
description: A program is a list of exact instructions the computer follows in order.
tags: [python, basics]
lesson: true
order: 1
status: draft
updated: 2026-11-16
---

```kv-machine
#! title: A program for making tea
print("Boil water")
print("Add tea leaves")
cups = 2
print("Pour into", cups, "cups")
```

Click the button. Each click, the computer reads **one** line and does it. Then it moves to the next line.

## See

A **program** is a list of instructions written so exactly that a computer can follow them without asking any questions.

> [!analogy] Like a recipe
> A recipe says *boil water, add tea leaves, pour into a cup*. You do the steps **in order**. A program is the same, except the cook is a computer that follows every step **literally** — it never guesses what you meant.

Three things are true of every program:

1. **It runs in order.** Top to bottom, one line at a time, unless you tell it to jump (see [[Conditions]] and [[Loops]]).
2. **It is exact.** `print("Boil water")` prints exactly *Boil water*. Misspell `print` and the computer doesn't know what you mean.
3. **It stops when it runs out of steps.** There's no "and so on".

> [!mistake] Common wrong idea
> "The computer understands what I want." It doesn't. It only understands what you *wrote*. Most beginner bugs come from the gap between the two.

## Play

Write a program for the robot. Drag the steps into order, then run them one at a time.

```kv-robot
title: Take the robot to the star
.....
.>.*.
.....
---
title: Go around the wall
.....
.>#*.
.....
```

Now fix a program. These steps make tea, but the order is wrong.

```kv-tea
```

```kv-predict
print("Pour into a cup")
print("Boil water")
print("Add tea leaves")
---
? What appears on the screen first?
- Boil water — the computer knows the right order for tea
+ Pour into a cup
- All three at the same time
> The computer follows the order you **wrote**, even when it makes no sense for tea. It doesn't know anything about tea.
```

Next: exact means exact. One letter is wrong in line 2.

```kv-predict
print("Boil water")
Print("Add tea leaves")
---
? What happens when this runs?
- Both lines print: Python can see what you meant
+ Line 1 prints, then Python stops with an error at line 2
- Nothing prints at all
> Python runs line 1 normally. On line 2 it finds `Print` with a capital P, a name it doesn't know, and stops with a NameError. The computer never guesses what you meant.
```

Last: a program stops when it runs out of steps.

```kv-predict
print("Boil water")
print("Add tea leaves")
---
? Tea also needs to be poured. What does the computer do after line 2?
- It pours the tea, because that comes next in a recipe
+ It stops: there are no more lines
- It asks you what to do next
> A program stops when it runs out of lines. It never adds a step you didn't write.
```

## Remember

> [!recap] In one breath
> A program is an exact list of instructions. The computer runs them **one by one, top to bottom**, does **exactly** what each says, and stops at the end.

- Order matters.
- Exactness matters: the computer never guesses.
- A *bug* is a gap between what you meant and what you wrote.

## Explain

> [!interview] "What is a program?"
> **Say it in this order:** definition → example → one detail that shows you understand it.
>
> *"A program is a set of instructions that tells a computer exactly what to do, step by step. For example, a program that prints three lines runs line 1, then line 2, then line 3. The computer follows the instructions literally and in order — it doesn't guess what you meant, which is why bugs happen."*

**Follow-up you might get:** *"What's the difference between a program and an algorithm?"* — An algorithm is the step-by-step **idea** for solving a problem (you could write it in English). A program is that idea written in a language a computer can run.
