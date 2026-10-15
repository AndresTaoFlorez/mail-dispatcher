"""Static integrity checks for the retained Python business references."""
import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ReferenceIntegrityTests(unittest.TestCase):
    def test_all_retained_python_sources_parse(self):
        paths = list((ROOT / "api").rglob("*.py")) + list((ROOT / "wdd").rglob("*.py"))
        self.assertTrue(paths)
        for path in paths:
            with self.subTest(path=str(path.relative_to(ROOT))):
                ast.parse(path.read_text(encoding="utf-8"))

    def test_retained_internal_imports_resolve(self):
        for path in (ROOT / "api").rglob("*.py"):
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if isinstance(node, ast.ImportFrom) and node.module:
                    modules = [node.module]
                elif isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                else:
                    continue
                for module in modules:
                    if module.split(".")[0] not in {"api", "wdd"}:
                        continue
                    target = ROOT.joinpath(*module.split("."))
                    with self.subTest(source=str(path.relative_to(ROOT)), module=module):
                        self.assertTrue(target.with_suffix(".py").is_file() or (target / "__init__.py").is_file())

    def test_assignment_references_are_retained(self):
        for path in ["wdd/engine.py", "wdd/models.py", "api/application/dispatcher.py", "api/application/ticket_service.py", "api/infrastructure/work_window_repository.py", "api/infrastructure/assignment_repository.py"]:
            self.assertTrue((ROOT / path).is_file(), path)
        classes = {node.name for node in ast.parse((ROOT / "api/domain/schemas.py").read_text(encoding="utf-8")).body if isinstance(node, ast.ClassDef)}
        self.assertTrue({"EspecialistCreate", "WorkWindowCreate", "CreateTicketsRequest"} <= classes)


if __name__ == "__main__":
    unittest.main()
