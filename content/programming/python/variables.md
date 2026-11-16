---
title: Variables
type: subtopic
category: Python
parent: Module 1 · The basics
description: A variable is a name that points to a value in memory.
tags: [python, variables, memory]
lesson: true
order: 5
status: draft
updated: 2026-11-16
---

```kv-lab
#! title: Variables in memory
age = 20
age = age + 1
name = "Ravi"
print(name, "is", age)
```

Try this: change `20` to `35`. Add a line `nickname = name`. Then add `age = 50` at the end and watch where the tag moves — and what happens to the old value.

## See

A **variable** is a **name** that refers to a **value** in memory.

When Python runs `age = 20`, two things happen:

1. Python creates the value **20** in memory (an *object*).
2. It sticks the **name** `age` on it.

The `=` sign doesn't mean "equals" like in maths. Read it as **"make the name on the left refer to the value on the right."**

> [!analogy] A name tag, not a box
> In some languages (like C or Java's `int`), a variable is often drawn as a **box** that holds a value. In Python a variable is a **name tag** stuck on a value. That's why the Live Lab shows tags with arrows: the tag isn't the value, it points to it.

### Changing a variable moves the tag

`age = age + 1` works right to left:

1. Look up what `age` points to → **20**.
2. Work out `20 + 1` → a **new** value, **21**.
3. Move the tag `age` onto **21**.

The old **20** now has no name pointing to it, so Python is free to throw it away. This clean-up is called **garbage collection**.

### Two names can point to the same value

`nickname = name` doesn't copy anything. It sticks a second tag on the **same** object. Try it in the lab — two arrows, one value.

### Naming rules

- Letters, digits and `_` only, and it can't start with a digit: `total_2` ✓, `2total` ✗
- Case matters: `Age` and `age` are different names.
- Use clear names: `price` beats `p`. Python style uses `snake_case`: `first_name`.

> [!mistake] Common wrong idea
> "`b = a` makes a copy of a." It doesn't — both names now point to the **same** object. For numbers and text you won't notice, but with lists (coming later) it matters a lot.

## Play

```kv-predict
x = 5
y = x
x = 7
print(y)
---
? What does this print?
- 7 — y follows x
+ 5
- An error
> `y = x` stuck the tag **y** on the object **5**. Then `x = 7` moved only the **x** tag to a new object. **y** is still on 5.
```

```kv-lab
#! title: Swap two values
a = 10
b = 20
temp = a
a = b
b = temp
print(a, b)
```

Click **Start again**, then **Next step** to watch the swap one line at a time. Then try Python's shortcut: replace the three middle lines with `a, b = b, a`.

## Remember

> [!recap] In one breath
> A variable is a **name** that points to a **value** in memory. `=` means "make this name point to that value". Re-assigning moves the name to a new value; values nobody points to get cleaned up. `b = a` gives the same value a second name — it doesn't copy.

- Read `x = x + 1` right to left: work out the value, then move the name.
- Names: letters, digits, `_`; not starting with a digit; case-sensitive.

## Explain

> [!interview] "How are variables stored in Python?"
> **Definition → example → diagram → edge case.**
>
> *"In Python a variable is a name that refers to an object in memory. When I write `age = 20`, Python creates an integer object 20 and binds the name `age` to it. If I then write `age = 21`, it doesn't change the 20 — it binds `age` to a new object 21, and the 20 is garbage-collected if nothing else refers to it. I'd draw it as a name tag with an arrow pointing to the value. One edge case: `b = a` makes both names refer to the same object — for a list, changing it through `b` is visible through `a` too."*

**Follow-ups you might get:**
- *"What does `id()` return?"* — A number identifying the object while it exists. Two names with the same `id` point to the same object.
- *"Is Python statically or dynamically typed?"* — Dynamically: the **value** has a type, the name doesn't. The same name can point to an int now and a string later.
