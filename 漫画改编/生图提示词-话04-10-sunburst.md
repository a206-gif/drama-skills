# 话4–话10 生图提示词包 + 话9 起身份锁模板｜gpt-image-2.5-sunburst 专用（身份锁 · 过审版）

> **2026-10-21 更新**：话9–话10 全部按**身份锁**重写（CAST LOCK 置顶 / 每格点名 / CONSISTENCY LOCK 收尾）。
> **参考图只上传女主、男主两张**，配角一律用「文字锁」，提示词里不写配角图片引用。
> 文末「话 9 及以后｜身份锁模板」自第 9 话起通用（含 9、10 话与成年期各话）。

> **分工（用户指令）**：生图全部由用户在 Arena 用 **gpt-image-2.5-sunburst** 完成；AI 负责分镜设计、提示词、后期贴字与入库。
> **尺寸**：1024×1536 竖版。**垫图只有两张**：幼年/少年=女主+男主对应阶段图；成年=参考-A+参考-B。配角不传图，用文字锁。
> **过审五原则**（本包已执行）：①零负面词（gpt 系无 negative，"no text / gore / blood / kill" 等词会反触发审核）②敏感一律结果态（伤口→红线/纱布、暴力→剪影/长影、死亡→静卧/遗物）③自然语言描述每格 ④一致性靠垫图+人物特征句每格写全 ⑤每条尾句固定合规声明。
> **画面内不出现文字**：不写"不要文字"这类负面句；若出图带字，回传后我修掉或重出。
> **被拦退路**：整页被拦就单格分拆（Panel 1/2/3 各出一张单图），我负责拼版贴字。
> **回传命名**：`第0X话/PX-页名.png` 放进对应话文件夹，我按本包台词贴字。

---

## 身份锁 IDENTITY LOCK（2026-10-21 起强制）

**为什么改**：旧版每条只在末尾写一句 `Same character designs stay consistent across panels`。
gpt-image-2.5-sunburst 会把这句话理解成"同一种风格的帅哥美女"，于是自由补全：发色漂移、瞳色变浅、
狼尾被剪成普通短发、助听器消失、姐弟俩同页认不出。**身份锁＝把不可变特征写成可执行约束**。

**三条硬规则**
1. **锁段置顶**：`CAST LOCK` 放在整段提示词最前（首段权重最高），再写 PANEL。
2. **每格复述**：每个 Panel 句里用 3–5 个词重复锁点，如 `the same silver-haired, ruby-eyed girl`。
3. **同框写死**：`exactly two people in this panel`、`he stands about 19 cm taller than her`；
   人数与身高差写死，模型就不会自己加人、改体型。

**垫图配对**（阶段必须对，传错阶段会直接串脸）

| 阶段 | 垫图组合 |
|---|---|
| 幼年（话2–8） | `参考画风111/女主幼年.png` + `参考画风111/男主幼年.png` + `第01话/P1-节哀.png` |
| 少年（话9–10） | `参考画风111/女主少年.png` + `参考画风111/男主少年.png` + `第01话/P1-节哀.png` |
| 成年（话11 起 / 话1） | `设定集/定妆图/参考-A-苏梨-25岁.png` + `设定集/定妆图/参考-B-霍谢山-25岁.png` |

> 单人页只传该角色 + 第01话成品页；双人页两张都传。垫图只锁"脸与画风"，服装与场景仍由文字控制。

**角色绑定表（2026-10-21 最终版：参考图只上传两张）**

> **上传规则（用户指令）**：只上传**女主 + 男主**两张参考图，配角一律不传图。
> 因此：主角写 `reference: the attached SU LI girl reference image`；
> **配角只写文字锁**（名字+年龄+身高+发型+瞳色+服装+辨识物），提示词里不准出现 `定妆图/XXX.png` 这类引用。
> 旧版另一个漏洞是配角全程泛称（`the flashy young man`），模型每格重画一张脸——现已全部点名。

| 代号 | 角色 | 阶段 | 上传参考图 | 文字锁 / 跨页识别特征 |
|---|---|---|---|---|
| A | 苏梨 | 幼年 8–9 | **✅ 上传** `参考画风111/女主幼年.png` | 银灰过腰长卷发（全片唯一银灰）、红瞳、苍白、圆脸小下巴 |
| A | 苏梨 | 少年 17 | **✅ 上传** `参考画风111/女主少年.png` | 同上，鹅蛋脸、发量丰盈、163cm |
| A | 苏梨 | 成年 25 | **✅ 上传** `定妆图/参考-A-苏梨-25岁.png` | 同上，更冷更瘦，163cm |
| B | 霍谢山 | 幼年 8 | **✅ 上传** `参考画风111/男主幼年.png` | 黑狼尾（顶短后长）、暗红瞳、瘦小；ch21 起右耳助听器、ch19 起细皮项圈 |
| B | 霍谢山 | 少年 16 | **✅ 上传** `参考画风111/男主少年.png` | 同上，后发过肩、182cm、廉价卫衣；项圈藏衣内 |
| B | 霍谢山 | 成年 25 | **✅ 上传** `定妆图/参考-B-霍谢山-25岁.png` | 后发披散近腰、186cm、项圈+梨牌终身佩戴 |
| C | 苏澄 | 少年 16 | ❌ 不传图（定妆图仅内部留档） | 冷蓝灰发（**比姐姐更蓝，不是银白**）、双耳小蓝钻、178cm |
| D | 杨少 | 26 | ❌ 不传图 | 墨绿丝绒西装+黑缎领、油亮背头、金戒指、**左眼下小痣** |
| E | 霍启珏 | 25 | ❌ 不传图 | 藏青长风衣、银叶胸针、侧分黑发、184cm |
| F | 蒋琳 | 16 | ❌ 不传图 | 深棕长直发+侧编发+珍珠发夹、校服红领结 |
| G | 姜月烟 | 44 | ❌ 不传图 | 银灰长发偏分+低盘发、炭灰高领长裙、珍珠耳环 |
| H | 苏庭渊 | 48 | ❌ 不传图 | 黑色三件套、鬓角灰、眉骨一道浅痕 |
| — | 小花 | 全期 | ❌ 不传图 | 老年德牧，灰白口鼻 |

**名字纪律（本次新增，专治"泛称漂移"）**
1. **CAST LOCK 首行写名字**：`YANG SHAO (26) — no reference image; lock by text only.` （主角写 `reference: the attached … reference image`；配角写 `no reference image`）
2. **每个 Panel 用名字**，不许用 `the flashy young man`、`the refined visitor`、`the boy`、`he` 指代主要动作。
   首句可加同位语：`YANG SHAO, the pampered heir, sits slumped...`。
3. **同页同一角色只许一套造型**；换装必须由剧情驱动并在该格写明。
4. 两个黑发男性同框（霍谢山 / 霍启珏）时，**每格都要带区分特征**：
   霍谢山=`black wolf-tail hair, beanie hearing aid on RIGHT ear`；霍启珏=`neat side-parted hair, navy trench, silver leaf pin`。

**反面示例（第 9 话 P4 原稿的真实毛病）**
> ✗ `the flashy young man sits slumped against the car door...`
> ——模型不知道这个"花而不实年轻人"是谁、上半页长什么样，于是每格重画一张脸。
> ✓ `YANG SHAO (26, emerald velvet blazer, gold rings, small mole under his LEFT eye) sits slumped against the car door...`
> ✓ 同一页 CONSISTENCY LOCK 再点一次名：`the same YANG SHAO and the same HUO XIESHAN in all three panels`。

**分格选角锁 PANEL CAST（2026-10-21 新增，专治"空镜串人"）**

**故障现象**（第 9 话 P4 实测）：P1 写的是 `a black luxury car parked crookedly under a huge pale moon, headlights cutting through mist, empty fields on both sides` —— 一句纯空镜，
模型却把 CAST LOCK 里的两个角色塞到车门边，画成"两人站在车旁对峙"，整页节奏全错。

**病因**：`CAST LOCK` 在页首列出角色，模型会当成**整页演员表并平均分配**到每一格；
只要某一格没写"这一格有谁"，它就自动补人。

**修法：每格开头写 `CAST:`，页首加 `RULE OF PRESENCE`**
```
RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named;
a panel that names no character is an empty shot with zero people in it.
```
```
PANEL 1 — CAST: NONE, an empty establishing shot with zero people.
(extreme wide, lonely countryside road at night) the only subject in this panel is a single black
luxury car parked crookedly across the empty lane, all four doors shut, the windows dark, nobody
standing beside it; headlights cutting a long cone through the mist, a huge pale moon above the
horizon, bare fields and telephone poles receding into darkness, cold blue-grey night palette,
deep empty foreground.

PANEL 2 — CAST: YANG SHAO, HUO XIESHAN. (tense result shot, medium) ...
```

**空镜四件套（写全才不会长人）**
1. `CAST: NONE`（大写，紧跟格号）
2. **主体唯一化**：`the only subject in this panel is ...`，把注意力钉在物件/地貌上
3. **物件状态写死**：`all four doors shut, the windows dark, nobody standing beside it`
4. **空间纵深**：`empty foreground / bare fields / poles receding into darkness`，给足无人区的信息量

> 需要"环境叙事"就写天候、地貌、光位、道具；**不要**在这一格里描述角色的动作、站位或衣服，
> 哪怕只是"车灯照着一个人影"也会把角色拉进来。

**同页有无人格混排时的 CONSISTENCY LOCK 写法**
`PANEL 1 contains no figures at all — the car and the landscape are the only content; YANG SHAO and HUO XIESHAN appear only in panels 2 and 3...`

**CHARACTER DIFFERENTIATION（两个黑发男性同框必备）**
```
CHARACTER DIFFERENTIATION — HUO XIESHAN is the lean teenage boy with the long black wolf-tail, the beige
hearing aid on his right ear and a black leather collar; YANG SHAO is the older man with slicked-back hair,
gold rings and the emerald velvet blazer. They never share a hairstyle, a jacket or an accessory.
```

**反面 → 正面（sunburst 不吃否定句，这样写必出错）**

| ✗ 旧写法 | ✓ 锁写法 |
|---|---|
| `Same character designs stay consistent.` | `the same silver-haired, ruby-eyed girl in every panel; identical face, hair length, eye color, age and costume across all three panels` |
| `a boy with wolf-tail hair` | 狼尾必须拆结构：`short choppy top, long back hair past the shoulders`；只写"wolf-tail"会被画成兽耳或普通短发 |
| `no animal ears` | 用正向句压住：`human ears; the wolf-tail is a haircut, not animal ears`（幼年页实测有效） |
| 只在页首写一次 | 页首 CAST LOCK + 每格 3–5 词复述 + 页尾 CONSISTENCY LOCK，三处都要有 |

**回传后锁脸校验（我这边执行，不合格退回重出）**
① 发色/瞳色与垫图一致 ② 狼尾后发长度对（少年=过肩）③ 右耳助听器在且位置对
④ 项圈状态符合时间线（ch19 起；少年常藏衣内）⑤ 同框身高差不漂 ⑥ 同页三格是同一张脸
⑦ 无多余角色/多发色

---

---

# 第 4 话｜两次救人失败·系统惩罚暗示（ch9–10）※旧版已过审失败，以此版为准

## P1「剧本破产」（3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters, clear panel borders. Panel 1 (wide shot, dusk): in an overgrown abandoned courtyard, a rough unkempt adult man stumbles heavily toward two small children; the 秦音幼年 girl spreads her arms wide in a dramatic protective pose in front of the 霍谢山幼年 boy who crouches behind her; her expression is theatrically brave. Panel 2 (medium shot): the man has suddenly toppled to the ground mid-step and lies groaning; in the foreground the 苏梨幼年 girl calmly lowers a small pink personal safety gadget in her hand, her expression perfectly deadpan. Panel 3 (close two-shot): the black-haired girl in the white dress freezes with a stiff awkward smile and a sweat drop on her temple, while the silver-gray-haired girl beside her gives her a cool sidelong glance; a few dry leaves drift past. Same child character designs stay consistent across panels. STYLE Digital painting, premium Japanese otome game CG style with semi-realistic painterly rendering: refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious colors, high-end commercial illustration quality. Modest, tasteful, non-graphic content suitable for a general audience.`
贴字预告：秦音「我会保护你们！」／旁白「他还没碰到人，自己就倒了。」／苏梨「你好像在等什么人……替你解决困难？」

## P2「定性」（3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters, clear panel borders. Panel 1 (night, warm lamp and car headlight glow): an elegant adult woman with long silver-gray hair in a refined black dress kneels and hugs the 苏梨幼年 girl tightly, both with worried tearful faces; a stern handsome adult man in a dark suit kneels beside them checking the child anxiously; two bodyguards with flashlights stand behind. Panel 2 (emotional close-up): the silver-gray-haired little girl with big teary ruby eyes tugs the sleeve of the man's suit, her lower lip trembling, a small bandage on her hand. Panel 3 (wide contrast shot): in the foreground the girl is held safely in her mother's arms with her parents' backs turned; far behind them by an iron gate, the 秦音幼年 girl in a white dress stands alone stiffly, her polite smile crumbling, cold rim light isolating her. Same child character designs stay consistent across panels. STYLE Digital painting, premium Japanese otome game CG style with semi-realistic painterly rendering: refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious colors, high-end commercial illustration quality. Modest, tasteful, non-graphic content suitable for a general audience.`
贴字预告：苏梨「是霍谢山保护了我。那个叔叔说，我很值钱……」／「爸爸……不想要梨梨了吗？」／旁白「她站在门外，没人再看她一眼。」

## P3「钉死」（3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters, clear panel borders. Panel 1 (grand manor hall at night): a middle-aged butler in a dark tailcoat hands a tablet computer showing small blurred security-camera thumbnails to a stern handsome adult man in a dark suit; beside him an elegant adult woman with long silver-gray hair in a black dress watches with a cold composed expression; across the hall the 秦音幼年 girl in a white dress stands stiffly cornered, hands twisting her skirt, a forced smile on her face. Panel 2 (close two-shot): the 霍谢山幼年 boy with messy black wolf-tail hair speaks with a flat calm expression while the black-haired girl beside him freezes wide-eyed in panic, sweat on her face, her smile cracking. Panel 3 (dramatic wide shot from inside a mansion gate at night): house staff in uniforms escort the black-haired girl in the white dress away down a lit driveway; she glances back over her shoulder with a resentful wounded look; a torn white ribbon flutters on the ground, long shadows. Same child character designs stay consistent across panels. STYLE Digital painting, premium Japanese otome game CG style with semi-realistic painterly rendering: refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious colors, high-end commercial illustration quality. Modest, tasteful, non-graphic content suitable for a general audience.`
贴字预告：刘叔「监控显示：她下午就在医院门外。」／霍谢山「姐姐没骗人。」／秦音内心「苏梨……要是去死就好了。」

## P4「光环碎裂」（3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters, clear panel borders. Panel 1 (warm-lit manor hallway): the 苏梨幼年 girl suddenly goes pale and sways, one small hand pressed over her heart, cold sweat on her brow, her silver hair flying as she starts to sink down, motion blur. Panel 2 (medium shot): the 霍谢山幼年 boy catches her in his arms, his face twisted in a panicked cry; behind them an elegant adult woman with long silver-gray hair and a stern adult man in a dark suit rush forward in alarm, dramatic lamp light and shadows. Panel 3 (surreal symbolic close-up): above the fainting silver-gray-haired girl a glowing golden halo ring hovers and cracks into shattering fragments with faint blue holographic particles drifting like a broken interface; her small hand reaches upward, eyes gently closed, ethereal divine light on a dark dreamlike background. Same child character designs stay consistent across panels. STYLE Digital painting, premium Japanese otome game CG style with semi-realistic painterly rendering: refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious colors, high-end commercial illustration quality. Modest, tasteful, non-graphic content suitable for a general audience.`
贴字预告：苏梨「唔——！」／霍谢山「苏梨——！」／内心「果然……反抗剧情，就会受罚吗。」「可是，我偏要改命。」／系统框「检测到剧情偏离……」

---
---

# 第 5 话｜小花登场·杀狗记忆闪回·苏澄伏笔（ch11–12）※已按 01 话基准重出（2026-10-20，4/4 完成）

## P1「病床小狗」（3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters, clear panel borders. Panel 1 (wide shot, dawn): a quiet seaside hospital room with tall arched windows showing a calm blue sea; the 苏梨幼年 girl lies in a wooden bed waking up, a small oxygen mask fogged with her breath, soft morning light across the blanket. Panel 2 (heartwarming close-up): the 霍谢山幼年 boy gently presses the top of his head into her open palm on the blanket, his dark red eyes shining with quiet joy like a puppy being petted, her small hand resting on his messy black hair. Panel 3 (comedy family beat): at the bedside the 苏澄幼年 boy puffs his cheeks and points an accusing finger while an old German shepherd dog with a shiny brass tag on its collar sits proudly; the sick girl giggles weakly into her mask. Same child character designs stay consistent across panels. STYLE Digital painting, premium Japanese otome game CG style with semi-realistic painterly rendering: refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious colors, high-end commercial illustration quality. Modest, tasteful, non-graphic content suitable for a general audience.`
贴字预告：旁白「她醒来时，是海城的清晨。」「他把脑袋，蹭进她的掌心。」／苏澄「他抢了小花的位置！还说自己是姐姐的小狗！」

## P2「前世之刀」（3 格·全页黑白水墨剪影）
`A black-and-white ink-wash comic page with exactly three rectangular panels arranged vertically, thin white gutters, sumi-e brush texture, high-contrast grayscale. Panel 1 (distant quiet scene): beneath a bare winter tree in a lonely courtyard at dusk, an old German shepherd lies quietly asleep on the ground, a coiled rope resting in the shadows beside the tree trunk, soft snow falling, a mourning atmosphere. Panel 2 (silhouette style): a small girl in a white dress with long dark hair stands in profile holding out a fluffy Pomeranian puppy with a sweet curved smile, her face half hidden in shadow, stark dark background. Panel 3 (symbolic motifs floating in mist): a surgeon's scalpel, a small bandaged hand resting on an embroidered pillow, a small funeral urn with drifting ash particles, and the faint fading silhouette of a small boy dissolving into the mist between them. STYLE: elegant melancholic grayscale ink illustration, professional brushwork, dramatic light and shadow. Modest, tasteful, non-graphic content suitable for a general audience.`
贴字预告：旁白「前世，小花没能熬过那个冬天。」／秦音「别难过。赔给你哦。」／旁白「前世的弟弟：学医、手断、早逝。没能长大。」

## P3「狗牌」（3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters, clear panel borders. Panel 1 (warm bedroom morning): a happy old German shepherd rolls over showing its belly on a blanket while the 苏梨幼年 girl giggles and pets its head; beside them the 苏澄幼年 boy pokes the dog's belly with a comical pouty face. Panel 2 (close-up): the 霍谢山幼年 boy stares enviously at the shiny new brass dog tag on the dog's collar, lower lip pouting with big puppy eyes; the silver-gray-haired girl beside him looks amused. Panel 3 (soft emotional close-up): the black wolf-tail-haired boy lowers his head with a pitiful trembling expression, tugging the girl's sleeve; she covers her mouth with a gentle moved smile, golden hour glow through the window. Same child character designs stay consistent across panels. STYLE Digital painting, premium Japanese otome game CG style with semi-realistic painterly rendering: refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious colors, high-end commercial illustration quality. Modest, tasteful, non-graphic content suitable for a general audience.`
贴字预告：旁白「小花翻着肚皮，求摸。」／霍谢山「为什么我没有？」／苏梨「狗牌……是狗戴的。」／霍谢山「戴了牌，大家就知道我是姐姐的人。走丢了，也能找回来。」／旁白「小狗永远忠诚。」

## P4「惊悚钩」（3 格）
`A full-color comic book page with exactly three rectangular panels arranged vertically, thin white gutters, clear panel borders. Panel 1 (night, inside a luxury car in the rain): a middle-aged butler in a dark suit glances back from the front passenger seat with a grave expression, holding a folder of documents; rain streaks down the windows and city lights glow outside; in the rear seat the 霍谢山幼年 boy sits quietly by the window in worn clothes. Panel 2 (chilling close-up framed by the rearview mirror): the boy's calm face half in shadow, his dark red eyes dark and unreadable, his cold gaze steady in the mirror. Panel 3 (unsettling profile close-up): the same boy looks out at the rainy night, faint city lights reflected in his dark red eyes, a small gentle smile that does not reach his eyes, quiet suspenseful atmosphere. Same child character design stays consistent across panels. STYLE Digital painting, premium Japanese otome game CG style with semi-realistic painterly rendering: refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious colors, high-end commercial illustration quality. Modest, tasteful, non-graphic content suitable for a general audience.`
贴字预告：刘叔「沈凝死前，有人付过一笔钱。」／旁白「后视镜里，他的眼神不像孩子。」／霍谢山「妈妈早就死掉了。他们都会死的。我会送他们……去陪妈妈。」

---
---

# 第 6 话｜村庄舆论战·平板揭密集体改口（ch13–15，PAY-03）

> **版式（2026-10-20 统一，以第 01 话为准）**：每页 **3 格**，只用**细白横向分格缝**，无黑框、无墨线、无网点；格内满幅厚涂插画。
> **画内不出现任何文字**（含横幅、平板 UI、招牌），中文全部由 `工具/贴字.py` 后期压入。
> **垫图**：`参考画风111/女主幼年.png` + `参考画风111/男主幼年.png` + `第01话/P1-节哀.png`。
> **幼龄锁**：`CRITICAL: all children are 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT teenagers. HUMAN ears; the wolf-tail is only a haircut, no animal ears.`
> **服化锁**：现代中国北方冬季乡村——羽绒服、棉袄、连帽衫、牛仔裤、针织帽；**禁止年代剧化**（无围裙、无披肩、无礼帽/八角帽）。


> **实测补丁（2026-10-21）**：光写 `HUMAN ears` 压不住兽耳，必须写成
> `small human ears visible at the sides of his head`（耳朵位置+可见）；
> 与 6 岁角色同框时男主会被画成十七八岁，须补 `head-to-body ratio about one to five, short neck, round full cheeks,
> soft small chin, no sharp jawline`——第 07 话 P5 就是漏了这句翻车的。

## P1「围堵」（3 格：远景围堵 / 车内 / 轮椅下车）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (wide establishing shot, overcast grey village road): a grieving middle-aged woman in a modern dark down jacket holds one end of a long blank white cloth banner stretched across the road, blocking a stopped black sedan; around her a crowd of villagers in modern winter coats mutters angrily and several reporters thrust cameras and microphones forward; bare trees and low tiled roofs, cold winter light. Panel 2 (medium shot, inside the back seat of the car): a frail 8-year-old girl with long silver-gray hair and clear ruby-red eyes sits calmly in a cream wool coat, a thin hospital patch on the back of one hand; beside her a small 8-year-old boy with messy black shaggy wolf-tail hair and dark red eyes — with normal human ears, absolutely no animal ears — grips her sleeve with anxious worried eyes; her small hand rests over his hand, reassuring; soft dim interior light through the tinted window. Panel 3 (low angle exterior): the same silver-gray-haired little girl is being seated in a lightweight wheelchair beside the open car door, a blanket over her knees, chin lifted, composed and fearless; her little brother, a silver-gray-haired boy of about six in a small navy duffle coat, stands loyally at her side; reporters' lenses and scornful villagers loom close around them, overcast sky. CRITICAL: all children are 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT teenagers, no adult faces. HUMAN ears; the wolf-tail is only a haircut, no animal ears, no cat ears, no pointed ears. MODERN WINTER CLOTHING ONLY: down jackets, padded coats, hoodies, knit beanies, jeans — absolutely no period-drama costume, no aprons, no shawls. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：方框「沈家举着横幅，堵住了进村的路。」／方框「横幅：还我公道！」／椭圆 苏梨「我知道，他们在冤枉你。我会帮你还回来。」／椭圆 苏梨「不要践踏自己的尊严。」

## P2「平板点名」（3 格：轮椅对峙 / 平板实证 / 众人发怵）✅ 已定稿
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (medium shot, outdoor overcast): a pale delicate 8-year-old girl with long silver-gray hair and ruby-red eyes sits in a lightweight wheelchair on a village road, wrapped in a cream wool cloak with a blanket over her knees, a slim tablet on her lap; she looks up calmly at a burly middle-aged villager in a dark down jacket whose smug expression is just beginning to crack; blurred crowd behind. Panel 2 (insert close-up, hands only): two small pale hands hold the slim tablet; its screen glows with neat rows of small blurred photo thumbnails, document cards and abstract black redaction blocks — completely unreadable abstract layout, no legible letters; cold blue screen light on the fingers, shallow depth of field. Panel 3 (crowd reaction, medium wide): the burly villager covers his flushed face with one thick hand and turns away, while a thin woman beside him pulls at his arm in agitation; the surrounding villagers step back with uneasy fearful expressions, several lowering their eyes, the mood of the crowd shifting; grey winter daylight. CRITICAL: the child is 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT a teenager, no adult face. HUMAN ears. MODERN WINTER CLOTHING ONLY, no period-drama costume. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：椭圆 苏梨「沈成贵是好人？那这些，是什么？」／方框「她握着所有人的秘密。」／方框「恐惧，开始蔓延。」

## P3「集体改口」（3 格·群戏爽点）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (wide crowd shot, cold overcast light): a frail 8-year-old girl with long silver-gray hair and ruby-red eyes in a wheelchair, wearing the SAME cream wool coat and knee blanket as the previous pages, slowly sweeps her calm gaze across a crowd of gathered modern villagers; people avoid her eyes and shrink back, hoods pulled low; one thin nervous man at the front swallows hard, sweat on his temple; low camera, the girl small in frame but the crowd parting around her. Panel 2 (medium shot, crowd level): the thin nervous man in a shabby grey parka steps forward and points urgently at the grieving middle-aged woman holding the white banner, shouting; the woman clutches the banner and staggers back a step; behind them other villagers begin to nod and raise their hands in agreement, faces turning. Panel 3 (punch shot, warm hopeful shift in light): the same crowd now turns toward the girl in the wheelchair, some cheering and giving thumbs up, faces relieved and ashamed at once; beside her the little black-haired boy in a dark hooded coat stands straight; in the foreground a young reporter stands frozen holding a microphone, blank stunned face; a break of pale sunlight through the clouds. CRITICAL: the child is 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT a teenager, no adult face. HUMAN ears; the black-haired boy's wolf-tail is only a haircut, no animal ears. MODERN WINTER CLOTHING ONLY: down jackets, parkas, hoodies, knit beanies, jeans, sneakers — absolutely no 1930s period-drama costume, no aprons, no shawls, no flat caps, no long skirts. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：椭圆 苏梨「我喜欢说真话。你们不说，就我来说。」／椭圆 瘦弱男人「是沈家花钱雇我们说假话的！」／方框「众人倒戈，齐夸苏家。记者当场懵掉。」

## P4「耳边」（3 格·名场面收尾）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (quiet medium shot, village edge at dusk): the exhausted middle-aged woman in a dark down jacket sits on a low stone wall and hands a small paper envelope to a tall middle-aged butler in a black tailcoat; the little silver-gray-haired girl in the wheelchair, cream wool coat and knee blanket, watches them from the side with a knowing calm expression; bare branches, cold blue dusk. Panel 2 (tender close-up, warm light): the silver-gray-haired 8-year-old girl leans close to the left ear of the little black-haired boy, one small hand cupped near her mouth as she whispers; he looks down with a quiet moved face, long lashes; a tiny beige hearing aid is clearly visible on his right ear; soft warm lamp light, shallow depth of field. Panel 3 (close two-shot, golden afternoon light): the black-haired boy looks up at her with shining dark red eyes, saying something earnest; the silver-gray-haired girl smiles warmly down at him, tired but gentle; bokeh of golden light behind them. CRITICAL: all children are 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT teenagers, no adult faces. HUMAN ears; the wolf-tail is only a haircut, no animal ears. MODERN WINTER CLOTHING ONLY. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：方框「沈家递上了汇款的证据。」／椭圆 苏梨「听不清就告诉我。我会一直说到你听清为止。」／椭圆 霍谢山「姐姐很厉害。」

---

# 第 7 话｜木坠信物·溺压逼系统（PAY-02）·挡刀（ch16–18）

> 同 01 话版式与幼龄/服化锁；P3 为 **PAY-02 合规降级**：不给施暴过程，只给水下剪影与结果态。


> **实测补丁（2026-10-21）**：光写 `HUMAN ears` 压不住兽耳，必须写成
> `small human ears visible at the sides of his head`（耳朵位置+可见）；
> 与 6 岁角色同框时男主会被画成十七八岁，须补 `head-to-body ratio about one to five, short neck, round full cheeks,
> soft small chin, no sharp jawline`——第 07 话 P5 就是漏了这句翻车的。

## P1「遗物」（3 格：交铁盒 / 遗物特写 / 母亲闪回）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (quiet daytime medium shot, warm interior): a tall middle-aged butler in a black tailcoat gently hands a small rusty iron box to a small 8-year-old boy with messy black wolf-tail hair and dark red eyes — normal human ears, no animal ears; the silver-gray-haired 8-year-old girl in a cream wool coat stands beside them watching with soft attentive eyes. Panel 2 (warm detail insert): the open iron box on a wooden table showing a small worn wooden comb, two faded old photographs of a gentle dark-haired young woman, and a simple carved wooden pendant on a worn cord; soft museum-like side light, shallow depth of field. Panel 3 (soft memory glow): a faint warm sepia flashback vignette of a gentle young woman with dark hair smiling and wrapping her arms protectively around a small boy with messy black hair, dreamlike soft focus, faint light bloom at the edges. CRITICAL: the boy is 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT a teenager. HUMAN ears; the wolf-tail is only a haircut, no animal ears. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：方框「刘叔交来了沈家留下的铁盒。」／方框「木梳、照片、木坠。这枚木坠，日后会带他回家。」／方框「临死前，她第一次对他笑了。也第一次，护住了他。」

## P2「碰瓷破产」（3 格：车前假摔 / 苏梨打招呼 / 眼神变冷）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (modern town street, bright winter day): an 8-year-old girl in a white wool dress and pale cape staggers gracefully and sinks down in front of a slow black luxury car, one hand to her forehead in a staged faint; the rear door opens and an elegant sorrowful middle-aged woman in a dark tailored coat steps out looking concerned; onlookers' legs at the frame edge. Panel 2 (medium shot): the silver-gray-haired 8-year-old girl in a cream wool coat arrives smiling and greets the middle-aged woman warmly, one hand raised; behind her the butler in a black tailcoat calmly presents a small tablet; the girl in white freezes mid-pose on the ground, still half-collapsed, eyes darting. Panel 3 (close-up): the elegant middle-aged woman's gentle expression turns cold and distant as she looks down at the girl in white; the black-haired girl's sweet mask cracks into wide-eyed panic, a bead of sweat at her temple; shallow depth of field, cold daylight. CRITICAL: all children are 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT teenagers, no adult faces. HUMAN ears. MODERN CLOTHING ONLY, no period-drama costume. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：方框「她又演了一出『晕倒』。」／椭圆 苏梨「沈姨，您也在这里？」／方框「沈夫人的眼神，冷了。」／椭圆 沈夫人「这种人，该进少管所。」

## P3「摊牌与逼供」（3 格·合规：池边低语 / 水下剪影 / 结果态）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (close two-shot, tense whisper, garden pond at dusk): the silver-gray-haired 8-year-old girl in a cream wool coat leans close to the black-haired girl in the white dress and speaks quietly with an unshakable calm smile; the black-haired girl's eyes go wide with terror, lips parted. Panel 2 (abstract underwater view, no bodies visible): seen from below the pond surface, small pale hands pressing near the rippling waterline, drifting silver bubbles, long black hair floating like ink in dark green water, sunlight fractured on the surface, dramatic abstract composition, strictly non-graphic. Panel 3 (result shot): the soaked black-haired girl sits gasping and coughing at the pond edge, hair plastered to her face, wrapped dress clinging, while the silver-gray-haired girl stands over her lowering her hands with a satisfied little smile; ripples spreading across the water, cold dusk light. CRITICAL: the children are 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT teenagers. HUMAN ears. Non-graphic: no injury, no violence shown, silhouette only. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：椭圆 苏梨「因为你重生了。」／椭圆 秦音「系统！快开金手指救救我！」／椭圆 苏梨「怎么会呢。我现在，才九岁。」

## P4「递帕与来敌」（3 格：递手帕 / 翻墙剪影 / 对峙）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (medium shot, garden, dusk): the black-haired 8-year-old boy walks up and holds out a clean white handkerchief to the silver-gray-haired girl with a polite little smile, deliberately ignoring the soaked girl on the ground; the girl takes it with an amused look, one brow raised; soft warm garden lamps. Panel 2 (action silhouette against dusk sky): a lean teenage boy in black clothes vaults over the garden wall, one arm pressed against his side, face cold and sharp, coat flaring mid-air; his figure reads mostly as shadow, no gore. Panel 3 (tense close two-shot): the small black-haired boy stands firmly in front of the silver-gray-haired girl facing the older teenager, his dark red eyes unblinking and resolute far beyond his age; she holds the back of his jacket, her ruby eyes narrowed calculatingly; low angle, cold blue dusk. CRITICAL: the children are 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT teenagers. HUMAN ears; the wolf-tail is only a haircut, no animal ears. Non-graphic. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：椭圆 霍谢山「姐姐，她很脏。」／方框「黑衣少年翻墙而入。」／方框「他挡在她身前，寸步不退。」

## P5「挡刀与钩子」（3 格·结果态）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration filling each panel edge to edge. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles, no captions. Panel 1 (dramatic shot from behind, backlit dusk): the small silver-gray-haired girl has thrown herself in front of her little brother with her arms spread wide, facing the lean teenage boy in black; a small dark red stain is seeping through her white sleeve near her hand — restrained, non-graphic, no blade, no wound detail; the little boy's face behind her frozen in horror; strong rim light. Panel 2 (soft interior, home clinic): the girl lies resting in a clean bed with a fresh white bandage wrapped around her small hand, eyes just opening, pale and calm; the butler and the black-haired boy stand around the bed with worried faces; warm bedside lamp. Panel 3 (close-up): the silver-gray-haired little brother tearfully grips the blanket beside her bed, round eyes red from crying; the black-haired boy stands behind him with a dark complicated expression, jaw tight. CRITICAL: the children are 8 years old — round soft cheeks, small chin, small hands, childlike proportions, NOT teenagers. HUMAN ears. Non-graphic: no blade, no wound close-up. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. Modest, tasteful, non-graphic content for a general audience.`
贴字预告：方框「她挡在了苏澄身前。」／方框「她在家庭医务室醒来。」／椭圆 苏澄「我害你受了伤，还害霍谢山要被赶走了。」

---

# 第 8 话｜狗链加冕（PAY-05）·蟹肉破案·上学契约（ch19–21，幼年期）

> **版式规格（2026-10-20 二次修订，以第 01 话为准）**：用户确认「按 01 话图的风格排版」。
> 即 **韩式电影感彩漫**：每页 3 格，仅用**细白横向分格缝**分隔，格内满幅厚涂插画；
> **不要黑框、不要墨线勾勒、不要网点、不要拟声线**；画面内不出现任何文字。
> 中文一律由 `工具/贴字.py` 后期压入，样式取 01 话同款：**细边小方框**（旁白/心声）+ **椭圆气泡**（对白）。
> 人物一致性靠垫图（女主幼年 / 男主幼年 / 第01话成品页），提示词须写明 **HUMAN ears，狼尾只是发型**。

## P1「逐客」（3 格·上宽/中远景/下宽）
`A vertical full-color comic page in cinematic Korean webtoon style: three panels separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in each panel. Panel 1 (wide): a dim manor corridor at night, warm light spilling from a half-open study door; the pale 9-year-old silver-gray-haired girl in a cream knit cardigan stands barefoot on the dark wood floor, one small hand on the door frame, quiet determined face, a small medical patch on the back of her hand. Panel 2 (tall): inside the warm study, her parents argue behind a heavy desk — an elegant silver-gray-haired woman in a dark dress and a stern man in a fine dark suit with his palm flat on the desktop, bookshelves and warm lamps, soft focus background. Panel 3 (wide): the girl pushes the door wide open and stands silhouetted in the doorway light; the two adults turn toward her, anger collapsing into surprise, long soft shadows. Keep clean uncluttered areas near panel edges for later text. No text, no letters, no speech bubbles. ` + STYLE + ``
贴字预告：方框「书房里，爸爸和妈妈在为他的去留争吵。」／椭圆「梨梨还没醒，我们怎么给她交代？」／「他不正常。」／「我要留下他。」／方框「她烧还没退，手背上还留着针眼。」

## P2「哀求」（3 格）
`A vertical full-color comic page in cinematic Korean webtoon style: three panels separated only by thin white horizontal gutters. Panel 1 (wide): a bare tidy guest room at night in cool blue moonlight, no belongings; the thin 8-year-old boy with messy black wolf-tail hair in a worn dark jacket crouches in the corner hugging a rusty iron box, tiny and alone, moonlight bars on the floor. Panel 2 (tall): extreme close-up of the boy's face lifted toward the viewer, dark red almond eyes red-rimmed and glistening with held-back tears, thin cheeks, pressed lips, moonlight rim light. Panel 3 (wide): the silver-gray-haired girl kneels before him and opens her palm, revealing a slim black leather choker with a thin silver chain edge and a small pear-shaped silver pendant; warm light pools in her palm; she smiles faintly; the boy stares wide-eyed. The boy has normal human ears; both are clearly young children. No text, no letters, no speech bubbles. ` + STYLE + ``
贴字预告：方框「这间客房，空得没有他的痕迹。」／椭圆「姐姐，你也要赶我走吗。」／「不是说要做我的小狗吗？」

## P3「加冕」（3 格·PAY-05 核心视觉）
`A vertical full-color comic page in cinematic Korean webtoon style: three panels separated only by thin white horizontal gutters. Panel 1 (wide): a warm dim study at night; the silver-gray-haired girl kneels on an old rug holding up the slim black leather choker with silver chain and pear-shaped pendant, the metal catching a soft glint. Panel 2 (tall): close-up of the boy, head tilted back, eyes closed, a quiet blissful smile as small fingers fasten the choker around his throat; the girl's lace cuff at the frame edge. Panel 3 (wide): low angle on his throat and collarbone as his own small hands click the clasp one notch tighter, the pendant resting against his worn jacket collar, warm lamp light, soft focus background. The boy has human ears. No text, no letters, no speech bubbles. ` + STYLE + ``
贴字预告：方框「照着花花的狗链做的，只是更精致。」／椭圆「想走的话，这个就用不上了。」／方框「他主动扣到最紧，把自己拴牢了。」／「汪汪！」

## P4「蟹肉」（3 格）
`A vertical full-color comic page in cinematic Korean webtoon style: three panels separated only by thin white horizontal gutters. Panel 1 (wide): a warm manor kitchen in daylight; two housemaids in aprons gossip lazily at the stove, one stirring rice porridge, a small dish of shredded crab meat beside the stove, steam rising. Panel 2 (tall): the thin black-wolf-tail-haired boy in a worn dark jacket with a school bag on one shoulder stands silently in the kitchen doorway, gaze flat and cold, backlit by corridor light. Panel 3 (wide): a big old German shepherd stands guard at the foot of the staircase while the two housemaids sit fallen on the floor, a dropped tray and broken bowl of spilled porridge across the tiles; the boy watches from the doorway in the background. Human ears only, no animal features on the boy. No text, no letters, no speech bubbles. ` + STYLE + ``
贴字预告：椭圆「一个小孩子而已，随便糊弄糊弄就好。」／「你们端着什么？」／方框「花花扑了下去，守住了楼梯。」／椭圆「里面有蟹肉。」

## P5「拉勾」（3 格·上学契约）
`A vertical full-color comic page in cinematic Korean webtoon style: three panels separated only by thin white horizontal gutters. Panel 1 (wide): a bright sickroom; the pale silver-gray-haired girl lies propped on lace pillows in a nightgown with a folded damp cloth on her forehead; the boy sits at the foot of the bed holding her blanketed feet against his chest to warm them, earnestly focused, morning light through lace curtains. Panel 2 (wide): medium two-shot, the girl speaks with a serious gentle face, one small finger lifted; the boy tilts his head up listening, the slim choker with pear-shaped pendant at his throat catching light, golden backlight. Panel 3 (wide): she hooks a finger under the pendant chain and draws him forward; he leans in with a contented half-closed smile, close two-shot, warm lace bedding. Both are clearly young children with small hands; human ears. No text, no letters, no speech bubbles. ` + STYLE + ``
贴字预告：方框「他把她的脚抱在怀里暖着。」／椭圆「你的人生，不是只有我。」／「好，拉勾。」

---

---

# 第 9 话｜长大打脸·荒郊私刑（PAY-04）·心跳铃声（ch22–25，少年期）

> **2026-10-21 二次修订**：全部按**点名 + 参考文件绑定**重写。每个角色在 CAST LOCK 里写名字和参考图，
> 每个 Panel 用名字指代，不再出现 `the flashy young man` 这类泛称。垫图：`女主少年.png` + `男主少年.png` + 对应配角定妆图。

## P1「长大首亮相」（3 格：初见成年脸 / 特训场 / 楼下仰望）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. SU LI (17) — reference: the attached SU LI girl reference image. A slender 163 cm girl, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red, long silver-gray wavy hair past her waist, center-parted with soft face-framing waves; the only silver-haired person in the story. SU CHENG (16) — no reference image; lock by text only. A lean 178 cm boy, cool ash-blue hair swept back (clearly bluer than his sister's silver), sharp handsome face, small blue diamond studs in both ears, black bomber jacket over a white tee, dark straight trousers, white sneakers. HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes. PANEL 1 — CAST: SU LI. (wide, sunlit balcony, morning) SU LI stands with her chin propped on one hand, looking down with a soft smile — the first full reveal of her grown-up face; warm light through the balustrade. PANEL 2 — CAST: SU CHENG, HUO XIESHAN. (wide, martial arts training yard below) SU CHENG and HUO XIESHAN spar with fast clean movements, SU CHENG in a light training shirt, HUO XIESHAN in a dark tank top with the beige hearing aid on his right ear; an ex-special-forces coach with folded arms watches, impressed; dust and crisp shadows. PANEL 3 — CAST: SU LI, SU CHENG, HUO XIESHAN. (low angle, wide) the same balcony from below, SU LI framed by flowers like a princess in a tower, SU CHENG and HUO XIESHAN standing below looking up at her like knights; warm afternoon light. CONSISTENCY LOCK: the same three named individuals in all three panels — SU LI, SU CHENG and HUO XIESHAN; identical face, hair length, hair color, eye color, age and costume in every panel; SU LI is the only silver-haired person, SU CHENG's hair is ash-blue, HUO XIESHAN's is black wolf-tail; no extra characters. Human ears; the wolf-tail is a haircut, not animal ears. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：旁白「可以惹任何人，不能惹苏梨。」

## P2「包间打脸」（3 格：嚣张 / 破门 / 结果态）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — no lead appears on this page; every character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. SU CHENG (16) — no reference image; lock by text only. A lean 178 cm boy, cool ash-blue hair swept back (clearly bluer than his sister's silver), sharp handsome face, small blue diamond studs in both ears, black bomber jacket over a white tee, dark straight trousers, white sneakers. YANG SHAO (26) — no reference image; lock by text only. A pampered heir with a slim soft build, narrow handsome face, thin arched brows, a small dark mole under his LEFT eye, glossy dark hair slicked back with two loose temple strands, gold rings and a heavy gold watch, deep emerald-green velvet blazer with black satin lapels over a black shirt. PANEL 1 — CAST: YANG SHAO, two nervous companions. (luxury private room, warm lamp light) YANG SHAO lounges on a leather sofa with a glass in one hand and a photograph of a silver-haired girl in the other, sneering; two nervous companions lean in trying to dissuade him, hands raised. PANEL 2 — CAST: SU CHENG, YANG SHAO. (explosive entrance, medium wide) the door bursts open and SU CHENG strides in with a dark dangerous smile, rolling up his sleeve; YANG SHAO's glass freezes halfway to his mouth, eyes wide. PANEL 3 — CAST: SU CHENG, YANG SHAO, two companions. (result shot, medium wide) YANG SHAO slumped dazed against the sofa, hair disheveled, his emerald blazer dusty; shattered glass glinting on the floor in the foreground; SU CHENG walks away tossing a bank card onto the table, long dramatic shadows; the companions stand back in awe. CONSISTENCY LOCK: the same SU CHENG and the same YANG SHAO in every panel; identical face, hair color, age and costume across the page; YANG SHAO keeps his emerald velvet blazer, gold rings and the mole under his left eye in all three panels; non-graphic — no blood, no visible injury, only dust and posture. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：苏澄「今天就是你的死期，狗东西。」／旁白「惹谁都行，别惹苏梨。」

## P3「双面男神」（3 格：校园人设 / 烧照片 / 火焰双面）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes. JIANG LIN (16) — no reference image; lock by text only. A sweet slender girl, round gentle face, warm brown eyes, long dark-brown straight hair with a thin side braid and a small pearl clip, navy school blazer with a red ribbon tie. PANEL 1 — CAST: HUO XIESHAN, JIANG LIN, classmates. (school campus, bright daylight, medium) HUO XIESHAN in a neat school uniform smiles gently while surrounded by admiring classmates, a book in his hand, sunlight in his messy fringe, the beige hearing aid visible on his right ear; JIANG LIN steps toward him with a hopeful blush. PANEL 2 — CAST: HUO XIESHAN. (quiet insert close-up) HUO XIESHAN's pale hand holds a small photograph over a stone railing while a lighter flame curls the paper's corner, tiny embers drifting; his face only at the edge of frame, calm and cold. PANEL 3 — CAST: HUO XIESHAN. (contrast close-up, flame light from below) HUO XIESHAN's face lit orange from beneath, a gentle smile paired with utterly cold dark red eyes, half the face in shadow. CONSISTENCY LOCK: the same HUO XIESHAN in all three panels; identical face, hair length, hearing aid and eye color across the page; JIANG LIN appears only in panel 1, with her side braid, pearl clip and red ribbon tie; the burned photograph shows only an indistinct pale face, no legible text. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：旁白「他的药，从来都是为她备的。」

## P4「荒郊私刑」（3 格·PAY-04 合规：氛围压迫不露血）

> **本页是"空镜串人"的修复样板**：P1 是**纯空镜**（无人物），P2/P3 才有人。每格用 `CAST:` 明确选角。

`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes; tonight he wears a plain black zip-up jacket, black trousers and black boots. YANG SHAO (26) — no reference image; lock by text only. A pampered heir with a slim soft build, narrow handsome face, thin arched brows, a small dark mole under his LEFT eye, glossy dark hair slicked back with two loose temple strands, gold rings and a heavy gold watch, deep emerald-green velvet blazer with black satin lapels over a black shirt, black slim trousers and glossy leather loafers. CHARACTER DIFFERENTIATION — HUO XIESHAN is the lean teenage boy with the long black wolf-tail, the beige hearing aid on his right ear and a black leather collar; YANG SHAO is the older man with slicked-back hair, gold rings and the emerald velvet blazer. They never share a hairstyle, a jacket or an accessory. PANEL 1 — CAST: NONE, an empty establishing shot with zero people. (extreme wide, lonely countryside road at night) the only subject in this panel is a single black luxury car parked crookedly across the empty lane, all four doors shut, the windows dark, nobody standing beside it; headlights cutting a long cone through the mist, a huge pale moon above the horizon, bare fields and telephone poles receding into darkness, cold blue-grey night palette, deep empty foreground. PANEL 2 — CAST: YANG SHAO, HUO XIESHAN. (tense result shot, medium) YANG SHAO sits slumped against the car door on the ground, dusty and trembling, his emerald velvet blazer torn at one shoulder and gold rings still on his fingers; HUO XIESHAN stands over him calmly adjusting his own cuff, the thin black leather collar with a small pear-shaped tag visible at his throat; long shadows across the wet asphalt. PANEL 3 — CAST: HUO XIESHAN, YANG SHAO. (double-face close-up, cold moonlight) HUO XIESHAN answers a phone call, his expression melting into a warm tender smile like sunshine, while his other hand rests calmly on YANG SHAO's shoulder, silencing him. CONSISTENCY LOCK: PANEL 1 contains no figures at all — the car and the landscape are the only content; YANG SHAO and HUO XIESHAN appear only in panels 2 and 3, with identical faces, hair and costumes across those two panels — YANG SHAO's emerald blazer, torn left shoulder and gold rings, HUO XIESHAN's wolf-tail, hearing aid and collar. Non-graphic — no blood, no weapon, the threat is carried by posture, shadow and expression. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：霍谢山「是苏梨的狗。」／电话里「已经在菜市场了。晚上吃糖醋小排？」

## P5「心跳铃声」（3 格：病房训弟 / 童年闪回 / 窗边织网）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. SU LI (17) — reference: the attached SU LI girl reference image. A slender 163 cm girl, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red, long silver-gray wavy hair past her waist, center-parted with soft face-framing waves; the only silver-haired person in the story. SU CHENG (16) — no reference image; lock by text only. A lean 178 cm boy, cool ash-blue hair swept back (clearly bluer than his sister's silver), sharp handsome face, small blue diamond studs in both ears, black bomber jacket over a white tee, dark straight trousers, white sneakers. XIAO HUA — a big old German shepherd with a graying muzzle and gentle eyes. PANEL 1 — CAST: SU LI, SU CHENG. (hospital room, day, medium) SU LI in a soft patient gown sits up in bed wagging a finger scoldingly at SU CHENG, who stands before her with neatly combed hair, studs removed, white shirt, hands behind his back, looking sheepish. PANEL 2 — CAST: SU CHENG (as a small child). (soft memory vignette, warm sepia) a small kindergarten-age boy with ash-blue hair biting another child's arm protectively, both in kindergarten clothes, comic-angry expressions, rounded soft childlike shapes. PANEL 3 — CAST: SU LI, XIAO HUA. (quiet suspense, medium) SU LI stands by the window in a light dress looking out over the city, a thoughtful determined expression; on the table beside her an old photograph of a black-haired woman and a small carved wooden pendant on a cord. CONSISTENCY LOCK: the same SU LI in all three panels and the same SU CHENG in panels 1 and 2 — panel 2 is SU CHENG as a small child, clearly younger, warm sepia toned; the carved wooden pendant is the same object in every appearance. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：苏梨「二十五岁前找不到配型……」／旁白「她开始织网，等猎物回到舞台。」

---

---

# 第 10 话｜霍启珏风波·自割掌嫁祸·舔血宣言（ch26–30，少年期）

## P1「到访」（3 格：客厅待客 / 雨里回家 / 领地被占）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. SU LI (17) — reference: the attached SU LI girl reference image. A slender 163 cm girl, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red, long silver-gray wavy hair past her waist, center-parted with soft face-framing waves; the only silver-haired person in the story. HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes. HUO QIJUE (25) — no reference image; lock by text only. An elegant upright man of 184 cm, composed courteous face, neat side-parted jet-black hair, a small silver leaf lapel pin, long navy wool trench coat over a white shirt and a dark grey tie. JIANG YUEYAN (44) — no reference image; lock by text only. An elegant woman, silver-gray hair worn smooth with a low chignon, cool grey almond eyes, charcoal silk floor-length dress, pearl earrings. SU TINGYUAN (48) — no reference image; lock by text only. A stern broad-shouldered man of 181 cm, hard angular face, short neat black hair with grey temples, black three-piece suit with a dark grey tie. PANEL 1 — CAST: HUO QIJUE, JIANG YUEYAN, SU TINGYUAN. (manor drawing room, elegant day, wide) HUO QIJUE in his navy trench coat sits with courteous posture holding a teacup, while JIANG YUEYAN gestures in introduction and SU TINGYUAN sits opposite; polished, formal conversation atmosphere. PANEL 2 — CAST: HUO XIESHAN. (rainy entrance hall, medium) HUO XIESHAN arrives home drenched from the rain, holding a plastic bag of raw pork ribs, his long back hair dripping, the beige hearing aid on his right ear; his dark red eyes fixed forward with quiet intensity. PANEL 3 — CAST: HUO XIESHAN, SU LI, HUO QIJUE. (territorial close three-shot) HUO XIESHAN leans his head gently onto SU LI's shoulder and smoothly eases himself between her and HUO QIJUE, his eyes never leaving her face; SU LI looks up at him with an amused soft smile; HUO QIJUE blinks, politely surprised. CONSISTENCY LOCK: the same SU LI, HUO XIESHAN, HUO QIJUE, JIANG YUEYAN and SU TINGYUAN in all three panels; JIANG YUEYAN shares SU LI's silver-gray hair but has an older, softer face — the two must not read as sisters; HUO XIESHAN (wolf-tail, hearing aid) and HUO QIJUE (side-parted hair, navy trench, silver leaf pin) must stay visually distinct in every panel; no extra guests. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：霍谢山「姐姐，他是谁啊？」

## P2「未婚夫冲突」（3 格：左耳低语 / 厨房停顿 / 抬眼）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. SU LI (17) — reference: the attached SU LI girl reference image. A slender 163 cm girl, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red, long silver-gray wavy hair past her waist, center-parted with soft face-framing waves; the only silver-haired person in the story. HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes. HUO QIJUE (25) — no reference image; lock by text only. An elegant upright man of 184 cm, composed courteous face, neat side-parted jet-black hair, a small silver leaf lapel pin, long navy wool trench coat over a white shirt and a dark grey tie. PANEL 1 — CAST: SU LI, HUO XIESHAN. (tender close-up) SU LI leans close to HUO XIESHAN's LEFT ear and speaks softly, one hand near her mouth; he lowers his eyes with a subtle unreadable little smile; the beige hearing aid is clearly visible on his RIGHT ear. PANEL 2 — CAST: HUO QIJUE, HUO XIESHAN. (kitchen, tense, medium wide) HUO QIJUE stands in the kitchen doorway speaking assertively with one hand gesturing to himself; at the chopping board HUO XIESHAN pauses mid-cut of pork ribs, the cleaver resting loosely in his hand, his eyes still down. PANEL 3 — CAST: HUO XIESHAN, HUO QIJUE. (freeze close-up) HUO XIESHAN slowly lifts his dark red eyes to HUO QIJUE, damp hair falling over one eye, a quiet smile on his lips and no warmth at all in his gaze; the cleaver rests calmly in his hand. CONSISTENCY LOCK: the same SU LI, HUO XIESHAN and HUO QIJUE in all three panels, each matching their bound reference; HUO QIJUE is the only man in a navy trench coat; the two black-haired men are told apart by hair shape and the hearing aid; no blood, no injury — the tension is pure performance. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：霍启珏「我是梨梨的未婚夫，以后喊我姐夫。」／霍谢山「未婚夫？」

## P3「自割掌嫁祸」（3 格·自伤=结果态，全程不出现切割动作）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. SU LI (17) — reference: the attached SU LI girl reference image. A slender 163 cm girl, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red, long silver-gray wavy hair past her waist, center-parted with soft face-framing waves; the only silver-haired person in the story. HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes. HUO QIJUE (25) — no reference image; lock by text only. An elegant upright man of 184 cm, composed courteous face, neat side-parted jet-black hair, a small silver leaf lapel pin, long navy wool trench coat over a white shirt and a dark grey tie. JIANG YUEYAN (44) — no reference image; lock by text only. An elegant woman, silver-gray hair worn smooth with a low chignon, cool grey almond eyes, charcoal silk floor-length dress, pearl earrings. SU TINGYUAN (48) — no reference image; lock by text only. A stern broad-shouldered man of 181 cm, hard angular face, short neat black hair with grey temples, black three-piece suit with a dark grey tie. PANEL 1 — CAST: HUO XIESHAN. (kitchen close-up, result state) HUO XIESHAN's open left palm held out, a single thin clean red line across it, one small drop welling; a kitchen knife lies flat on the cutting board beside it; his face wears a polite apologetic smile. No cutting action, no blade in motion. PANEL 2 — CAST: HUO XIESHAN, JIANG YUEYAN, SU TINGYUAN. (medium) HUO XIESHAN calmly presents his marked palm toward JIANG YUEYAN and SU TINGYUAN with a modest harmless expression, head slightly tilted, perfectly guileless, dark red eyes soft. PANEL 3 — CAST: JIANG YUEYAN, SU TINGYUAN, HUO QIJUE, SU LI. (family reaction, medium wide) JIANG YUEYAN and SU TINGYUAN stand in the doorway, their eyes moving from the knife on the board to the thin red line on HUO XIESHAN's palm, their expressions turning cold toward HUO QIJUE, who holds the knife handle awkwardly; in the background SU LI covers her mouth, hiding a knowing look. CONSISTENCY LOCK: the same five named individuals in all three panels, each matching their bound reference; the red line stays a thin clean line — no gore, no open wound, no cutting motion anywhere in the page. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：霍谢山「对不起，我不小心弄的。和这位霍先生没关系。」

## P4「照护与醋意」（3 格：包扎 / 缝合 / 便当试探）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. SU LI (17) — reference: the attached SU LI girl reference image. A slender 163 cm girl, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red, long silver-gray wavy hair past her waist, center-parted with soft face-framing waves; the only silver-haired person in the story. HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes. PANEL 1 — CAST: SU LI, HUO XIESHAN. (tender close-up) SU LI carefully wraps a clean white bandage around HUO XIESHAN's palm, her long hair falling forward, her expression gentle and focused; he watches her with a quietly blissful smile, the hearing aid visible on his right ear. PANEL 2 — CAST: HUO XIESHAN, a doctor. (hospital treatment room, soft light, medium) HUO XIESHAN sits with his hand being stitched by a doctor in gloves, but his eyes are only on SU LI, who stands over him supervising with crossed arms. PANEL 3 — CAST: SU LI, HUO XIESHAN. (night, warm interior, medium close) SU LI holds up a piece of food with a firm teasing look; HUO XIESHAN leans forward obediently to take it, then pauses with a thoughtful sideways glance, a faint jealous curve to his mouth. CONSISTENCY LOCK: the same SU LI and the same HUO XIESHAN in all three panels; the bandage and the thin red line are the same injury carried consistently; identical faces, hair and costumes; exactly two people per panel; non-graphic. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：霍谢山「被人欺负了，姐姐会帮我出头的。」／「姐姐好像很了解他。」

## P5「舔血宣言」（3 格·重度降级：剪影+暗示）
`A vertical full-color comic page in cinematic Korean webtoon style: exactly three panels stacked vertically, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering. CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below. RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it. SU LI (17) — reference: the attached SU LI girl reference image. A slender 163 cm girl, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red, long silver-gray wavy hair past her waist, center-parted with soft face-framing waves; the only silver-haired person in the story. HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes. XIAO HUA — a big old German shepherd with a graying muzzle and gentle eyes. PANEL 1 — CAST: HUO XIESHAN. (night hospital room, moonlight only, wide) the slim teenage silhouette of HUO XIESHAN crouches quietly beside SU LI's bed, gently holding her hand against his bowed forehead, blue moonlight, only shapes and light. PANEL 2 — CAST: HUO XIESHAN, SU LI. (quiet symbolic close-up, near darkness) HUO XIESHAN's profile rimmed by moonlight, eyes closed, SU LI's small hand held in both of his, a single faint red thread-like mark on her fingertip; everything soft and hushed. PANEL 3 — CAST: SU LI, XIAO HUA. (morning comedy, medium) SU LI wakes in daylight looking puzzled at her palm while XIAO HUA happily licks her hand; morning sunshine, gentle humor. CONSISTENCY LOCK: the same SU LI and the same HUO XIESHAN throughout — panels 1 and 2 are the same night scene in silhouette with his long back hair and hearing aid faintly readable, panel 3 is the next morning; keep it non-graphic and non-sexualized, fully clothed. RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality. RATING: modest, tasteful, non-graphic, suitable for a general audience.`
贴字预告：霍谢山内心「赝品没关系。真品，毁掉就行。」／苏梨「小花，别闹。」

---

---

# 话 9 及以后｜身份锁模板（复制即用）

> **适用范围（2026-10-21 用户确认）**：**从第 9 话起**，含第 9 话、第 10 话，一直用到成年期各话。
> 第 9、10 话的 10 条提示词已按本模板改写，可直接照抄它们的写法。

**上传规则**
- 参考图**只传两张**：女主 + 男主，按阶段取（少年 `女主少年`/`男主少年`；成年 `参考-A`/`参考-B`；幼年 `女主幼年`/`男主幼年`）。
- **配角一律不传图**，全部走**文字锁**：名字 + 年龄 + 身高 + 发型结构 + 瞳色 + 服装 + 一件辨识物。
- 所以提示词里只允许这一种引用写法：`reference: the attached SU LI girl reference image` / `… HUO XIESHAN boy …`。
  **不准写 `reference: 定妆图/D-杨少.png` 之类**——用户不会上传那张图，写了等于没锁。
- 配角文字锁也要**每格复述**：`the same YANG SHAO in his emerald velvet blazer`，否则同页照样换脸。

---

## 一、CAST 块（二选一，按话数）

**少年期（第 9–10 话，17 / 16 岁）**
```
CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below and appears identically in all three panels:
SU LI (17) — reference: the attached SU LI girl reference image. A slender 163 cm girl, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red, long silver-gray wavy hair past her waist, center-parted with soft face-framing waves; the only silver-haired person in the story.
HUO XIESHAN (16) — reference: the attached HUO XIESHAN boy reference image. A tall lean 182 cm boy, pale skin, sharpened jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy layered top, messy fringe, back hair long past the shoulders with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar hidden under his clothes.
```

**成年期（第 11 话起，25 / 25 岁）**
```
CAST LOCK — the two leads must match the two attached reference images exactly; every other character is locked by the written description below and appears identically in all three panels:
SU LI (25) — reference: the attached SU LI reference image. A slender 163 cm woman, pale porcelain skin, oval face with a small pointed chin, large almond eyes in clear ruby red with a dark outer lash line, long silver-gray wavy hair past her waist, center-parted; quiet elegant presence with a cool sharp edge.
HUO XIESHAN (25) — reference: the attached HUO XIESHAN reference image. A tall 186 cm man, pale skin, sharp jawline, narrow dark red almond eyes under heavy lids, thin cold lips, black wolf-tail hair (short choppy top, messy fringe, back hair loose to his waist with cool gray highlights), a small beige hearing aid on his RIGHT ear, a thin black leather collar with a small pear-shaped tag at his throat.
```

## 二、配角文字锁（不传图，整句粘进 CAST 块）

| 角色 | 文字锁（英文，直接粘） |
|---|---|
| 苏澄 16 | `SU CHENG (16) — no reference image. A lean 178 cm boy, cool ash-blue hair swept back (clearly bluer than his sister's silver, never silver-white), sharp handsome face, small blue diamond studs in both ears, black bomber jacket over a white tee, dark trousers, white sneakers.` |
| 秦音 16 | `QIN YIN (16) — no reference image. A petite girl with a delicate doll-like face, long straight black hair, cold sullen eyes, wearing a plain white dress.` |
| 杨少 26 | `YANG SHAO (26) — no reference image. A pampered heir, slim soft build, narrow handsome face, thin arched brows, a small dark mole under his LEFT eye, glossy dark hair slicked back with two loose temple strands, gold rings and a heavy gold watch, deep emerald-green velvet blazer with black satin lapels over a black shirt.` |
| 霍启珏 25 | `HUO QIJUE (25) — no reference image. An elegant upright man of 184 cm, composed courteous face, calm grey-brown eyes, neat side-parted jet-black hair, a small silver leaf lapel pin, long navy wool trench coat over a white shirt and a dark grey tie, polished brown oxfords.` |
| 蒋琳 16 | `JIANG LIN (16) — no reference image. A sweet slender girl of 160 cm, round gentle face, large warm brown eyes, long dark-brown straight hair with a thin side braid and a small pearl clip at her right temple, navy school blazer, white shirt with a red ribbon tie, grey pleated skirt.` |
| 姜月烟 44 | `JIANG YUEYAN (44) — no reference image. An elegant woman of 166 cm, soft cheekbones, cool grey almond eyes, long silver-gray hair swept over one shoulder with a low chignon, small pearl earrings, charcoal silk floor-length dress with a high neckline.` |
| 苏庭渊 48 | `SU TINGYUAN (48) — no reference image. A stern broad-shouldered man of 181 cm, hard angular face, deep-set dark eyes, short neat black hair with grey temples, black three-piece suit with a dark grey tie, plain silver watch.` |
| 刘叔 | `LIU SHU — no reference image. A middle-aged butler in a black tailcoat with a white shirt and black bow tie, silver-streaked hair, calm respectful face.` |
| 黑衣少年 | `HEIYI YOUTH — no reference image. A lean teenage boy in plain black clothes, sharp cold handsome face, one arm held as if nursing an old ache.` |
| 沈夫人 | `MADAME SHEN — no reference image. An elegant sorrowful woman in her forties, dark tailored coat, hair in a low bun.` |

## 三、先定版式，再写提示词（第 11 话起强制）

**顺序不能反**：先按 `工具/版式库.md` 给这一话排「页 → 版式代号」，再写提示词。
版式句是提示词的**第一句**，放在 CAST LOCK 之前，模型才会先搭格子再放人。

| 代号 | 版式句（英文，直接放开头） |
|---|---|
| `L3-V` | `exactly three equal panels stacked vertically, separated only by thin white horizontal gutters` |
| `L2-W` | `two panels: a wide panoramic panel across the top third, and one large close-up panel filling the bottom two thirds, separated only by a thin white gutter` |
| `L3-T` | `three panels: one large panel filling the top two thirds, and two smaller panels side by side in the bottom third, separated only by thin white gutters` |
| `L3-B` | `three panels: two smaller panels side by side across the top third, and one large panel filling the bottom two thirds, separated only by thin white gutters` |
| `L4-Q` | `four panels in a two by two grid, separated only by thin white gutters` |
| `L2-D` | `two panels side by side in a vertical split, a thin white vertical gutter between them` |
| `L3-S` | `one huge panel across the top two thirds, a narrow horizontal strip panel beneath it, and one final panel at the bottom, separated only by thin white gutters` |
| `L5-T` | `four panels: a wide horizontal strip at the top, two equal panels in the middle row, and a wide horizontal strip at the bottom, separated only by thin white gutters` |
| `L-S` | 单镜页，不写 gutters：`ONE single full-page cinematic illustration, no panel borders, no panel divisions — the entire page is one uninterrupted painting` |

**每页规划表**（写提示词前先填，随提示词一起交付）

```
| 页 | 版式 | 这一页的功能 | 是否有单镜页理由 |
| P1 | L2-W | 交代地点 + 抛出人物情绪 | — |
| P2 | L3-T | 冲突 + 两种反应 | — |
| P3 | L4-Q | 群像哗然 | — |
| P4 | L3-B | 两条线收束 | — |
| P5 | L-S  | 转折点：当众揭穿 | 三问 3/3 |
```

**全套版式必须遵守的三不**：不相邻两页同版式、同版式一话 ≤2 次、单镜页一话 ≤1 次。

## 三·A、页面骨架（多格页）

```
A vertical full-color comic page in cinematic Korean webtoon style: <版式句>, separated only by thin white horizontal gutters, no black frame lines, no ink outlines, full-bleed painterly illustration in every panel, clean uncluttered space near panel edges for later lettering.

[CAST 块：两张主角锁 + 本页配角文字锁，一人一句]
RULE OF PRESENCE: a character listed here appears ONLY in the panels where that character is named; a panel that names no character is an empty shot with zero people in it.

[有相似角色时加一句]
CHARACTER DIFFERENTIATION — [A 的发型/道具] vs [B 的发型/道具]；they never share a hairstyle, a jacket or an accessory.

PANEL 1 — CAST: [本格有谁；空镜写 NONE]. (shot size, location, time of day) [动作 + 表情 + 关键道具]，the same silver-haired, ruby-eyed woman.
PANEL 2 — CAST: [...] (shot size, ...) HUO XIESHAN [动作]，the same black wolf-tail, hearing-aid man.
PANEL 3 — CAST: [...] (shot size, ...) [点名写动作 + 配角服装复述]，两人同框写 exactly two people in this panel。

CONSISTENCY LOCK: the same faces, hair length, hair color, eye color, age, costume and height difference across the panels where each character appears; every named character keeps the same outfit and identifying prop in every panel they are in; any panel marked CAST: NONE contains no figures at all. Human ears; the wolf-tail is a haircut, not animal ears.

RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality.

RATING: modest, tasteful, non-graphic, suitable for a general audience.
```

## 三·A2、单镜页骨架（L-S）

```
A vertical full-color SINGLE-PANEL cinematic illustration in Korean webtoon style: ONE uninterrupted painting,
no panel borders, no panel divisions, full-bleed, clean negative space in the upper area for later lettering.

[CAST 块：只写画面里真的出现的人，通常 1–2 人]
SINGLE SUBJECT: [一句话说清这一击是什么 —— 谁、在什么处境、什么表情、什么光]

COMPOSITION: [镜头/机位/光位/景深/留白位置]，[关键道具位置]，[情绪落点]

CONSISTENCY LOCK: [角色] matches the attached reference exactly in face, hair, eye color and age; the same costume and identifying prop as the previous pages of this chapter. Human ears; the wolf-tail is a haircut, not animal ears.

RENDERING: premium Japanese otome game CG digital painting, semi-realistic Korean manhwa cover quality, thick painterly brushwork, refined elegant faces, expressive detailed eyes, fine individual hair strands, soft luminous skin, rich fabric textures, soft cinematic lighting, muted harmonious color palette, high-end commercial illustration quality.

RATING: modest, tasteful, non-graphic, suitable for a general audience.
```

> 单镜页**不写** `PANEL 1/2/3`、不写 `gutters`、不写 `panels`；
> 一旦出现 `panel` 这个词，模型就会自作主张切格子。

## 三·B、空镜格（CAST: NONE）写法

纯环境格最容易"长人"。四件事写全：

1. `PANEL n — CAST: NONE, an empty establishing shot with zero people.`
2. 主体唯一化：`the only subject in this panel is a single black luxury car ...`
3. 物件状态写死：`all four doors shut, the windows dark, nobody standing beside it`
4. 空间纵深：`empty foreground / bare fields / telephone poles receding into darkness`

> 空镜格里**不要**写任何角色动作、站位、衣服，连"车灯照着一个人影"都不要。

## 四、出图前自检

1. 参考图**只有两张**，阶段对不对（少年别传成年图）。
2. 每个配角都是「名字 + 年龄 + 身高 + 发型 + 瞳色 + 服装 + 辨识物」，有没有只写"一位贵妇"。
3. 每个 Panel 都点了名，没有 `the boy` / `the visitor` / `he` 单独扛动作。
4. 同页同一角色只有一套衣服。
5. 两个黑发男性同框时，每格都带区分特征（狼尾+助听器 vs 侧分头+风衣+银叶胸针）。

---

---

## 交付提醒
- 每页出图后按 `第0X话/PX-页名.png` 命名放入对应话文件夹（第04话/第05话已有 arena 版可覆盖或另存 `-2.5版.png`，由你定）。
- 我收到即：贴字（台词见每页「贴字预告」）→ 三关质检（厚涂质感/锁脸/男女主同级渲染）→ 入库推送。
- 整页被审核拦：拆成 Panel 1/2/3 三张单图回传，我拼版。
- **身份锁自检**：出图前先看 CAST LOCK 与垫图阶段对不对（少年页别传成年垫图）；出图后按上方 7 条锁脸校验过一遍，不过就重出，别带着错版往下走。

---
## 工作模式更新（2026-10-20）
gpt-image-2.5-sunburst 对童年内容触发儿童风险审核，**童年期（话4–话8）改回 AI 用 Arena 双模型候选生成**；本包话9–10（少年期）提示词保留，供用户在 sunburst 自生成时使用。
