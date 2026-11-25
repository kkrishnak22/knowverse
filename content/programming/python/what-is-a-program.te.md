---
title: Program ante enti?
description: Program ante computer order lo follow chese exact instructions list.
---

```kv-machine
#! title: Tea chese program
print("Boil water")
print("Add tea leaves")
cups = 2
print("Pour into", cups, "cups")
```

Button nokku. Prathi click ki computer **okka** line chadivi, adi chestundi. Tarvata next line ki veltundi.

## See

**Program** ante computer emi adagakunda follow cheyyagaliginanta exact ga raasina instructions list.

> [!analogy] Recipe laaga
> Recipe lo *neellu marigichu, tea podi veyyi, cup lo poyyi* ani untundi. Nuvvu steps ni **order lo** chestav. Program kuda ante, kaani ikkada vanta chesedi computer. Adi prathi step ni **unnadi unnatlu** chestundi: nuvvu em anukunnavo eppudu guess cheyyadu.

Prathi program ki ee moodu nijam:

1. **Adi order lo run avutundi.** Paina nunchi kindaki, okka line tarvata okati, nuvvu jump cheyyamani cheppe varaku ([[Conditions]], [[Loops]] choodu).
2. **Adi exact.** `print("Boil water")` exact ga *Boil water* ani print chestundi. `print` spelling tappu raaste, nuvvu em antunnavo computer ki teliyadu.
3. **Steps aipogaane adi aagipotundi.** "Ala ala" ani emi undadu.

> [!mistake] Common ga unna tappu idea
> "Naaku em kaavalo computer ki ardham avutundi." Avvadu. Nuvvu *raasindi* matrame daaniki ardham avutundi. Beginners bugs chaala varaku ee rendinti madhya gap nunchi vastayi.

## Play

Robot kosam oka program raayi. Steps ni order lo drag chesi, tarvata okkokkati ga run cheyyi.

```kv-robot
title: Robot ni star daggaraki teesukellu
.....
.>.*.
.....
---
title: Wall chuttu vellu
.....
.>#*.
.....
```

Ippudu oka program fix cheyyi. Ee steps tea chestayi, kaani order tappu.

```kv-tea
```

```kv-predict
print("Pour into a cup")
print("Boil water")
print("Add tea leaves")
---
? Screen meeda modata em vastundi?
- Boil water: tea ki correct order computer ki telusu
+ Pour into a cup
- Moodu okesari vastayi
> Tea ki artham kakapoyina, nuvvu **raasina** order ne computer follow avutundi. Daaniki tea gurinchi emi teliyadu.
```

Next: exact ante exact. Line 2 lo okka letter tappu.

```kv-predict
print("Boil water")
Print("Add tea leaves")
---
? Idi run ayinappudu em jarugutundi?
- Rendu lines print avutayi: nuvvu em anukunnavo Python ki ardham avutundi
+ Line 1 print avutundi, tarvata line 2 daggara Python error tho aagipotundi
- Asalu emi print avvadu
> Python line 1 ni maamoolu ga run chestundi. Line 2 lo capital P tho `Print` kanipistundi. Adi Python ki teliyani peru, kaabatti NameError tho aagipotundi. Nuvvu em anukunnavo computer eppudu guess cheyyadu.
```

Last: steps aipogaane program aagipotundi.

```kv-predict
print("Boil water")
print("Add tea leaves")
---
? Tea ni cup lo poyyali kuda. Line 2 tarvata computer em chestundi?
- Tea poyyi postundi, endukante recipe lo next adhe
+ Aagipotundi: inka lines levu
- Next em cheyyalo ninnu adugutundi
> Lines aipogaane program aagipotundi. Nuvvu raayani step ni adi eppudu add cheyyadu.
```

## Remember

> [!recap] Okka maata lo
> Program ante exact instructions list. Computer vaatini **okkokkati ga, paina nunchi kindaki** run chestundi, prathi daanni **exact ga** chestundi, chivariki aagipotundi.

- Order mukhyam.
- Exactness mukhyam: computer eppudu guess cheyyadu.
- *Bug* ante nuvvu anukunnadaaniki, raasinadaaniki madhya gap.

## Explain

> [!interview] "Program ante enti?"
> **Ee order lo cheppu:** definition → example → nuvvu ardham chesukunnav ani choopinche okka detail.
>
> *"Program ante computer ki em cheyyalo step by step ga exact ga cheppe instructions set. Example ki, moodu lines print chese program line 1, tarvata line 2, tarvata line 3 run chestundi. Computer instructions ni unnadi unnatlu, order lo follow avutundi. Nuvvu em anukunnavo guess cheyyadu, andukane bugs vastayi."*

**Vache follow-up question:** *"Program ki algorithm ki teda enti?"* Algorithm ante oka problem ni solve chese step-by-step **idea** (daanni English lo kuda raayochu). Program ante aa idea ni computer run cheyagalige language lo raayadam.
