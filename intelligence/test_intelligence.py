import unittest
from predictive_engine import PredictiveEngine
from grounded_ai import GroundedAIAssistant
from knowledge_base import KnowledgeBase

class TestIntelligenceSuite(unittest.TestCase):
    def setUp(self):
        self.predictor = PredictiveEngine()
        self.assistant = GroundedAIAssistant()
        self.kb = KnowledgeBase()

    def test_predictive_disk_depletion(self):
        scans = [
            {"timestampUtc": "2026-09-01T00:00:00Z", "volumes": [{"mountPoint": "C:", "freeGb": 80.0, "totalGb": 200.0}]},
            {"timestampUtc": "2026-09-05T00:00:00Z", "volumes": [{"mountPoint": "C:", "freeGb": 60.0, "totalGb": 200.0}]},
            {"timestampUtc": "2026-09-10T00:00:00Z", "volumes": [{"mountPoint": "C:", "freeGb": 40.0, "totalGb": 200.0}]}
        ]
        flags = self.predictor.detect_trends(scans)
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0]["type"], "disk_space_declining")
        self.assertEqual(flags[0]["dropPercent"], 20)

    def test_predictive_thermal_creep(self):
        scans = [
            {"timestampUtc": "2026-09-01T00:00:00Z", "cpu": {"temperatureCelsius": 42.0}},
            {"timestampUtc": "2026-09-05T00:00:00Z", "cpu": {"temperatureCelsius": 44.0}},
            {"timestampUtc": "2026-09-10T00:00:00Z", "cpu": {"temperatureCelsius": 56.0}}
        ]
        flags = self.predictor.detect_trends(scans)
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0]["type"], "thermal_envelope_degradation")
        self.assertAlmostEqual(flags[0]["temperatureClimbC"], 13.0)

    def test_ai_grounded_answer_real_numbers(self):
        snapshot = {
            "cpu": {"model": "Intel Core i7-13700H", "loadPercent": 74.0, "temperatureC": 48.0},
            "system": {"model": "Avantis BookPro 14"}
        }
        res = self.assistant.answer_query("What is my CPU load?", snapshot)
        self.assertIn("74", res["answer"])
        self.assertIn("48", res["answer"])
        self.assertEqual(res["evidence"]["cpu_load_percent"], 74.0)

    def test_ai_refuses_hallucinating_gpu(self):
        snapshot = {
            "gpus": [{"name": "Intel Iris Xe Graphics", "isDedicated": False}],
            "cpu": {"loadPercent": 15.0}
        }
        res = self.assistant.answer_query("What is my NVIDIA RTX GPU temperature?", snapshot)
        self.assertIn("integrated", res["answer"].lower())
        self.assertIn("no dedicated discrete gpu", res["answer"].lower())

    def test_ai_refuses_off_topic(self):
        res = self.assistant.answer_query("Write me a poem about butterflies.")
        self.assertIn("cannot assist with off-topic", res["answer"].lower())

    def test_ai_empty_baseline(self):
        res = self.assistant.answer_query("Is my computer healthy?", None)
        self.assertIn("no diagnostic snapshot", res["answer"].lower())

if __name__ == "__main__":
    unittest.main()
