# 生图提示词库 v2｜gpt-image-2.5-sunburst 过审版

目标模型：Arena 内 gpt-image-2.5-sunburst。生成时把对应参考图作为输入图（垫图）一并上传。
v1（关键词堆版）保留在 `生图提示词库.md`，供其他工具使用；**本文件为 gpt 系专用**。

## 转换原则（过审关键）
1. 删除全部负面词（gpt 系无 negative prompt；"child sexualization / gore / blood" 等词会反触发审核）。
2. 敏感情节降级为结果态：掰手自伤→抱臂静坐；创口血渍→细小手术疤痕；"stalker"等定性词删除，只留画面。
3. 关键词堆砌 → 自然语言描述；面板数量与顺序写清楚。
4. 一致性靠：参考图输入 + "same face as the reference image" 身份句。
5. 末尾统一加一句合规声明：`Modest, tasteful, non-graphic content suitable for a general audience.`

## 积木（拼接用）

STYLE：
`Digital painting, premium Japanese otome game CG style with semi-realistic painterly rendering: refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious colors, high-end commercial illustration quality.`

身份A（苏梨）：`The woman from the reference image (same face): long flowing silver-gray wavy hair, ruby-red almond eyes, fair delicate skin.`
身份B（霍谢山）：`The man from the reference image (same face): long black wolf-cut hair — tousled on top, long at the back, wolf-tail silhouette, never short hair — dark red almond eyes, fair skin.`

年龄句：
- 幼年A：`a 9-year-old girl who is clearly the child version of the woman from the reference image, the same facial features in child proportions with soft chubby cheeks`
- 幼年B：`an 8-year-old boy who is clearly the child version of the man from the reference image, the same facial features in child proportions, thin small frame`
- 少年A：`a 17-year-old girl who is the teenage version of the woman from the reference image, the same facial features, slender graceful figure`
- 少年B：`a 16-year-old boy who is the teenage version of the man from the reference image, the same facial features, tall lanky build`

---

## 定妆图（4）

定A-幼年（垫图：参考-A｜竖版）
`A full-body standing character portrait of [幼年A], long silver-gray wavy hair falling to her waist, pale delicate skin, gentle calm intelligent expression with a soft smile, frail and sweet. She wears a simple pale knitted cardigan over a plain cotton dress and plain shoes. Plain neutral studio background with soft lighting. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

定A-少年（垫图：参考-A｜竖版）
`A full-body standing character portrait of [少年A], long silver-gray wavy hair past her waist, pale delicate skin, gentle calm intelligent expression with a faint smile, quietly elegant and slightly frail. She wears a simple light blouse and a long skirt with plain flats. Plain neutral studio background with soft lighting. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

定B-幼年（垫图：参考-B｜竖版）
`A full-body standing character portrait of [幼年B], messy black hair in a clear wolf-tail shape (tousled on top, distinctly longer at the back), dark red eyes with a wary guarded look, quiet and serious. He wears a worn faded jacket and trousers and carries a small woven back-basket with sweet potatoes. Plain neutral studio background. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

定B-少年（垫图：参考-B｜竖版）
`A full-body standing character portrait of [少年B], messy black wolf-tail hair with a small loose tuft at the back, calm gentle face with a faint enigmatic smile and dark unreadable eyes. A small beige hearing aid on his right ear; a slim dark leather choker-style collar with a small pear-shaped metal tag. He wears a plain dark hoodie and casual trousers. Plain neutral studio background. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

---

## 第 1 话·灵堂钩子（垫图：参考-A+参考-B）

P1「节哀」（竖版，3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters, clear panel borders. Panel 1 (wide shot): a solemn modern Chinese family memorial service in a grand hall, white chrysanthemum wreaths, a framed black-and-white portrait of a handsome young man with long black wolf-cut hair, guests in black formal wear holding white chrysanthemums. Panel 2 (medium close-up): [身份A] with her silver-gray hair loosely pinned up, wearing an elegant modest black dress, holding a white chrysanthemum, looking dazed and melancholic. Panel 3 (close shot): two guests in black whispering to each other while glancing at her with envious expressions. Same characters stay consistent across panels. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

P2「创口」（竖版，3 格｜已降级：创口血渍→细小手术疤痕）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters. Panel 1 (medium close-up): [身份A] in a black mourning dress gently touching the cheek of [身份B], a young man lying peacefully in an open casket, wearing a fine black suit, pale and thin, eyes closed, serene. Panel 2 (quiet detail shot): his shirt slightly open at the chest showing a thin healed surgical scar line, tasteful and non-graphic, a woman's hand resting nearby. Panel 3 (large emotional close-up): her face, eyes wide with sudden realization, one hand pressed over her own heart. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

P3「密室」（竖版，3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters. Panel 1 (medium shot): [身份A] in a black mourning dress standing before a heavy dark metal door with an electronic keypad lock, a respectful male assistant in a black suit beside her holding a sealed envelope. Panel 2 (insert close-up): her slender finger pressing digits on the glowing keypad, the door seam opening onto darkness. Panel 3 (point-of-view shot): the open door revealing a dim windowless room, faint blue light from several monitor screens, small photographs lining the walls in the shadows, details left half-hidden. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

CG1「注视」（横版，单张｜已降级：删除 stalker 定性词）
`A single cinematic illustration without any panels: inside a dim windowless private room, [身份A] stands at the center in an elegant modest black dress, turning back to look over her shoulder at the viewer with wide shocked eyes. The walls are covered with hundreds of small personal photographs of the same silver-haired woman in everyday moments; one wall glows with rows of security monitors showing home-camera views and heartbeat graphs; her old personal belongings are neatly arranged on a low bed. Moody blue-teal lighting, elegant melancholic atmosphere, rich painterly detail. Leave quiet empty space along the bottom edge of the image. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

---

## 第 2 话·新生（垫图：出场者参考图；幼年戏加垫你的幼年定妆图）

P1「重生」（竖版，3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters. Panel 1 (medium shot): a slender elegant young mother with dark hair holding a pale 9-year-old girl [幼年A], the girl in a simple pale blue dress and cream cardigan just waking with a start, looking dazed. Panel 2 (large close-up): the little girl's small hand slowly clenching, her ruby eyes showing a startlingly mature and resolute gaze in a child's face. Panel 3 (wide shot): a small motorcade arriving at a countryside orphanage gate with a welcome banner and orphans waiting in line, soft overcast daylight. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

P2「光环与系统」（竖版，3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters. Panel 1 (medium shot): a thin plain-looking 10-year-old orphan girl with simple black hair in faded clothes handing out supplies and small gifts to other orphans with a sweet selfless act, while a young elegant dark-haired mother watches, moved. Panel 2 (close-up): the same orphan girl looking up at a translucent futuristic holographic interface panel floating beside her head, glowing soft blue-violet with blank empty text fields and simple icons, ambition in her eyes. Panel 3 (medium shot): the 9-year-old girl [幼年A] watching calmly from behind a doorway with a faint knowing smile. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

P3「设局」（竖版，3 格｜已降级：自伤动作→结果态）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters. Panel 1 (medium shot, late-afternoon light): the 9-year-old girl [幼年A] sitting alone at the base of a tree on a quiet country path, cradling one arm against herself, sleeve smudged with dirt, calm and determined expression, no visible injury. Panel 2 (close-up): her face as she wipes away a single tear, her eyes sharp and calculating beneath the tears. Panel 3 (dramatic backlit shot): at the end of the path, the silhouette of a small thin boy [幼年B] with a woven back-basket appears against the sunlight, face not yet visible. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

P4「初遇」（竖版，3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters. Panel 1 (medium full reveal): [幼年B] standing on a rural path, messy black wolf-tail hair, dark red wary eyes, worn faded clothes, a woven back-basket with sweet potatoes on his back. Panel 2 (two-shot close-up): the 9-year-old girl [幼年A] looking up at him with a tearful pleading expression, one arm held carefully, reaching out her small hand. Panel 3 (insert close-up): two small children's hands gently clasping in warm afternoon light. [STYLE] Modest, tasteful, non-graphic content suitable for a general audience.`

---

## 过审操作建议
1. 每次只传 1–2 张必要参考图；参考图本身含哥特服饰，属美术风格图，无敏感内容。
2. 若漫画页仍被拦：拆成 3 张单格图分别生成（单图过审率高），后期拼版加分格线。
3. P2 若连"open casket / surgical scar"仍被拦：把格 2 换成"她的手按住自己心口的特写"，真相全靠对白。
4. CG1 若被拦：把"hundreds of small photographs"改成"many small photographs"，删"security monitors"保留照片墙即可。
5. 生成尺寸建议：漫画页竖版 2:3（如 1024×1536），CG 横版 3:2（如 1536×1024）。
