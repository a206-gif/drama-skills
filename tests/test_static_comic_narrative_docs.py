"""Documentation packaging checks; they cannot judge story quality or fidelity."""
from pathlib import Path
import re
import tempfile
import unittest
import shutil


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / 'skills' / 'static-comic'


class NarrativeSkillDocsTests(unittest.TestCase):
    def test_standalone_copy_has_working_narrative_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            copied = Path(tmp) / 'static-comic'
            shutil.copytree(SKILL, copied, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
            for relative in ('SKILL.md', 'references/narrative-pacing.md',
                             'assets/叙事拆话模板.md', 'assets/叙事拆话示例.md'):
                file = copied / relative
                self.assertTrue(file.is_file(), relative)
                for target in re.findall(r'\]\(([^)#]+)(?:#[^)]*)?\)', file.read_text(encoding='utf-8')):
                    if '://' not in target and not target.startswith('mailto:'):
                        self.assertTrue((file.parent / target).is_file(), f'{relative}: {target}')

    def test_explicit_full_chapter_and_partial_promotion_are_distinguished(self):
        reference = (SKILL / 'references/narrative-pacing.md').read_text(encoding='utf-8')
        for phrase in ('完整讲完一个章节/故事', '不得因推广默认而只留片段',
                       '不将猜测、指控或角色自述写成已证实事实',
                       '读取实际最新上话结尾', '暂缓不是解决',
                       '不预设“每章两话”或“每章十几话”', '不暗缩字或删关键句'):
            self.assertIn(phrase, reference)

    def test_routing_and_templates_are_connected(self):
        main = (SKILL / 'SKILL.md').read_text(encoding='utf-8')
        reference = (SKILL / 'references/narrative-pacing.md').read_text(encoding='utf-8')
        template = (SKILL / 'assets/叙事拆话模板.md').read_text(encoding='utf-8')
        example = (SKILL / 'assets/叙事拆话示例.md').read_text(encoding='utf-8')
        self.assertIn('references/narrative-pacing.md', main)
        self.assertIn('assets/叙事拆话模板.md', main)
        self.assertIn('assets/叙事拆话示例.md', main)
        self.assertIn('可在阅读平台检索的正式书名', reference)
        for field in ('原著事件链', '连续拆话', '单话分页表', '结尾比较'):
            self.assertIn(field, template)
        self.assertIn('纯合成', example)
        self.assertIn('下一话必须接', example)
        self.assertIn('不是证明他说谎', example)


if __name__ == '__main__':
    unittest.main()
