---
title: How your code actually runs
type: subtopic
category: Python
parent: Module 0 · Before you code
description: Python reads your code one line at a time, from top to bottom.
tags: [python, interpreter, basics]
lesson: true
order: 3
status: draft
updated: 2026-11-16
---

```kv-machine
#! title: Python reads one line at a time
price = 40
qty = 3
total = price * qty
print(total)
```

Click the button to run one line at a time. Watch where each line goes: into **memory**, or onto the **screen**.

## See

When you press **Run**, the Python interpreter does three things:

1. **Reads** your whole file and checks it's valid Python. A missing bracket is caught here, before anything runs — that's a `SyntaxError`.
2. **Translates** it into simpler instructions called **bytecode**.
3. **Runs** the bytecode, one line at a time, **top to bottom**.

> [!analogy] Like reading a recipe aloud
> Python is a cook who reads one step, does it, then reads the next. It never skips ahead, and it can't use an ingredient that a later step will buy.

### Errors stop the program at that line

If line 3 has a problem, lines 1 and 2 have already run and line 4 never runs. The error message tells you **which line** and **what kind** of problem — read it, it's trying to help.

> [!mistake] Common wrong idea
> "Python reads the whole program and understands it first." It only checks the *grammar* first. It discovers problems like an unknown name only when it reaches that line.

## Play

Something's wrong in this lab — the console shows the error. Fix the typo and watch it run.

```kv-lab
#! title: Fix the bug
price = 40
qty = 3
total = price * qty
print(totl)
```

```kv-predict
print("start")
print(score)
score = 10
---
? What happens?
- It prints start, then 10
+ It prints start, then stops with a NameError
- Nothing prints — Python sees the error first
> Python runs top to bottom. Line 1 prints **start**. On line 2, `score` doesn't exist yet — it's only created on line 3 — so Python stops with a **NameError**.
```

## Remember

> [!recap] In one breath
> Python checks your grammar, turns your code into bytecode, then runs it **line by line, top to bottom**. An error stops the program **at that line**; lines before it have already run.

- `SyntaxError` → the grammar is wrong, nothing runs.
- Other errors (`NameError`, `TypeError`…) → found while running, at that line.

## Explain

> [!interview] "What happens when you run a Python program?"
> *"The interpreter first parses the file and compiles it to bytecode. If the syntax is wrong it stops with a SyntaxError before running anything. Then the Python virtual machine executes the bytecode line by line, top to bottom. If a line fails at runtime — say a name isn't defined — it raises an exception at that line, and the lines before it have already run."*

**Follow-up:** *"What's a .pyc file?"* — A cached copy of the bytecode for an imported module, so Python doesn't have to recompile it next time.
