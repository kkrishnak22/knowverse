---
title: Your first program
type: subtopic
category: Python
parent: Module 0 · Before you code
description: print() shows text and numbers on the screen.
tags: [python, print, basics]
lesson: true
order: 4
status: draft
updated: 2026-11-16
---

```kv-lab
#! title: Make it print your name
print("Hello!")
print("My name is Ravi")
print("I am", 20, "years old")
```

Change *Ravi* to your name and 20 to your age. Then add a line of your own.

## See

`print()` is a **function** — a ready-made instruction. Whatever you put inside the brackets, Python shows on the screen.

- **Text goes in quotes:** `print("Hello")`. Text in Python is called a **string**. Single quotes work too: `print('Hello')`.
- **Numbers don't:** `print(20)` prints the number 20.
- **Commas print several things** with a space between them: `print("Age:", 20)` → `Age: 20`.
- **Each print starts a new line.**

> [!analogy] Quotes are like speech marks
> In a story, *He said "run"* means he said the word *run*. In Python, `"20 + 1"` means the characters 2, 0, space, +, space, 1 — not maths.

> [!mistake] Common mistakes
> - `Print("hi")` — Python is case-sensitive. It must be lowercase `print`.
> - `print("hi)` — a missing closing quote is a `SyntaxError`.
> - `print(hello)` without quotes — Python looks for a **name** called hello and gives a `NameError`.

## Play

```kv-predict
print("5" + "5")
print(5 + 5)
---
? What do these print?
+ 55 and 10
- 10 and 10
- 55 and 55
> `+` on two strings **joins** them, so `"5" + "5"` is the text **55**. On two numbers `+` adds, giving **10**.
```

Try it in the lab: what does `print("ha" * 3)` do?

## Remember

> [!recap] In one breath
> `print()` shows things on the screen. Text goes in quotes (a **string**); numbers don't. Commas print several things with spaces in between. Each `print` starts a new line.

## Explain

> [!interview] "What's the difference between "5" and 5?"
> *"`"5"` is a string — the character five, as text. `5` is an integer — a number you can do maths with. So `"5" + "5"` joins them into `"55"`, while `5 + 5` adds them to `10`."*
