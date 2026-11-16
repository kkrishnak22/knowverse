---
title: Input and output
type: subtopic
category: Python
parent: Module 1 · The basics
description: input() reads what the user types. print() shows results.
tags: [python, input, output]
lesson: true
order: 7
status: draft
updated: 2026-11-16
---

```kv-lab
#! title: Ask, then answer
#! inputs: Ravi | 19
name = input("What's your name? ")
age = input("How old are you? ")
next_year = int(age) + 1
print("Hi", name + "!")
print("Next year you'll be", next_year)
```

The lab types the answers **Ravi** and **19** for you. Notice in memory that `age` points to the **string** `'19'` (amber), and `next_year` points to the **int** 20 (teal).

## See

**Output** is what your program shows. **Input** is what it receives from the user.

- `print(...)` → output to the screen.
- `input("question")` → shows the question, waits for the user to type, and gives back what they typed.

### input() always gives you a string

Even if the user types `19`, `input()` returns the text `"19"`. To do maths, convert it:

```python
age = int(input("Age? "))
```

> [!analogy] Like a form on paper
> Whatever someone writes in a box on a form is just handwriting. You have to *read* it as a number before you can add to it. `int()` is that reading step.

### Nicer output with f-strings

```python
print(f"Hi {name}, next year you'll be {next_year}")
```

Put `f` before the quotes and anything inside `{ }` is replaced by its value.

> [!mistake] Common mistake
> `age = input("Age? ")` then `age + 1` → **TypeError**: you can't add a number to a string. Convert first with `int(age)`.

## Play

```kv-predict
age = "19"
print(age + "1")
---
? What does this print?
- 20
+ 191
- TypeError
> Both are strings, so `+` **joins** them: `"19" + "1"` is `"191"`. That's why `input()` values need `int()` before maths.
```

Change the lab: replace the two `print` lines with a single f-string.

## Remember

> [!recap] In one breath
> `print()` shows output; `input()` reads what the user types and **always returns a string**. Convert with `int()` or `float()` before doing maths. f-strings — `f"Hi {name}"` — drop values straight into text.

## Explain

> [!interview] "What does input() return?"
> *"Always a string, whatever the user types. If I need a number I wrap it: `int(input())`. If the text isn't a valid number, that raises a ValueError, so in real code I'd handle that with try/except."*
