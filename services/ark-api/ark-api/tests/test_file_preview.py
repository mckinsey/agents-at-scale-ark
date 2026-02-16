import unittest
import base64
import io
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from src.ark_api.api.v1.file_preview import router
from fastapi import FastAPI

app = FastAPI()
app.include_router(router, prefix="/v1")
client = TestClient(app)


class TestFilePreview(unittest.TestCase):

    def test_health_endpoint(self):
        """Test that health endpoint returns 200"""
        response = client.get("/v1/file-preview/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "service": "file-preview"})

    def test_preview_spreadsheet_csv(self):
        """Test CSV file preview with minimal data"""
        csv_content = b"Name,Age,City\nJohn,30,NYC\nJane,25,LA"
        encoded_content = base64.b64encode(csv_content).decode()

        request_data = {
            "content": encoded_content,
            "filename": "test.csv",
            "mimeType": "text/csv"
        }

        response = client.post("/v1/file-preview/spreadsheet", json=request_data)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("sheets", data)
        self.assertIn("metadata", data)
        self.assertEqual(len(data["sheets"]), 1)
        self.assertEqual(data["sheets"][0]["name"], "Sheet1")
        self.assertEqual(len(data["sheets"][0]["rows"]), 3)  # Header + 2 data rows

    def test_preview_spreadsheet_excel(self):
        """Test Excel file preview with mocked openpyxl"""
        with patch('src.ark_api.api.v1.file_preview.openpyxl.load_workbook') as mock_load:
            # Mock workbook structure
            mock_wb = MagicMock()
            mock_sheet = MagicMock()
            mock_sheet.max_row = 2
            mock_sheet.max_column = 2
            mock_sheet.cell.return_value.value = "test"
            mock_sheet.cell.return_value.data_type = 'n'
            mock_wb.sheetnames = ["Sheet1"]
            mock_wb.__getitem__.return_value = mock_sheet
            mock_wb.worksheets = [mock_sheet]
            mock_load.return_value = mock_wb

            excel_content = b"fake excel content"
            encoded_content = base64.b64encode(excel_content).decode()

            request_data = {
                "content": encoded_content,
                "filename": "test.xlsx",
                "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }

            response = client.post("/v1/file-preview/spreadsheet", json=request_data)
            self.assertEqual(response.status_code, 200)

            data = response.json()
            self.assertIn("sheets", data)
            self.assertEqual(data["metadata"]["fileType"], "excel")
            mock_wb.close.assert_called_once()

    def test_preview_spreadsheet_invalid_base64(self):
        """Test with invalid base64 content"""
        request_data = {
            "content": "invalid-base64!@#",
            "filename": "test.csv",
            "mimeType": "text/csv"
        }

        response = client.post("/v1/file-preview/spreadsheet", json=request_data)
        # Invalid base64 causes a 500 error currently - not ideal but documenting current behavior
        self.assertEqual(response.status_code, 500)

    def test_preview_spreadsheet_unsupported_format(self):
        """Test with unsupported file format - it will try to parse as CSV and may succeed"""
        content = b"some content"
        encoded_content = base64.b64encode(content).decode()

        request_data = {
            "content": encoded_content,
            "filename": "test.txt",
            "mimeType": "text/plain"
        }

        # The API tries to parse text/plain as CSV, which may succeed
        response = client.post("/v1/file-preview/spreadsheet", json=request_data)
        # Just check it doesn't crash - status could be 200 or 400 depending on content
        self.assertIn(response.status_code, [200, 400])

    def test_preview_spreadsheet_empty_csv(self):
        """Test handling of empty CSV file"""
        csv_content = b""
        encoded_content = base64.b64encode(csv_content).decode()

        request_data = {
            "content": encoded_content,
            "filename": "empty.csv",
            "mimeType": "text/csv"
        }

        response = client.post("/v1/file-preview/spreadsheet", json=request_data)
        # Empty CSV returns 400 in the current implementation
        self.assertEqual(response.status_code, 400)

    def test_preview_spreadsheet_large_csv(self):
        """Test CSV with many rows gets truncated to MAX_ROWS"""
        # Create CSV with 1100 rows (more than MAX_ROWS=1000)
        rows = ["Col1,Col2,Col3"]
        for i in range(1100):
            rows.append(f"Val{i},Data{i},Info{i}")
        csv_content = "\n".join(rows).encode()
        encoded_content = base64.b64encode(csv_content).decode()

        request_data = {
            "content": encoded_content,
            "filename": "large.csv",
            "mimeType": "text/csv"
        }

        response = client.post("/v1/file-preview/spreadsheet", json=request_data)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        # Should be truncated to MAX_ROWS (1000) + 1 for header = 1001
        self.assertLessEqual(len(data["sheets"][0]["rows"]), 1001)
        # Check metadata exists and has expected fields
        self.assertIn("metadata", data)
        self.assertIn("fileType", data["metadata"])

    def test_preview_spreadsheet_tsv(self):
        """Test TSV (tab-separated values) file preview"""
        tsv_content = b"Name\tAge\tCity\nJohn\t30\tNYC\nJane\t25\tLA"
        encoded_content = base64.b64encode(tsv_content).decode()

        request_data = {
            "content": encoded_content,
            "filename": "test.tsv",
            "mimeType": "text/tab-separated-values"
        }

        response = client.post("/v1/file-preview/spreadsheet", json=request_data)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("sheets", data)
        self.assertEqual(len(data["sheets"]), 1)
        self.assertEqual(len(data["sheets"][0]["rows"]), 3)
        # Verify tab separation worked by checking first row has 3 columns
        self.assertEqual(len(data["sheets"][0]["rows"][0]), 3)


if __name__ == "__main__":
    unittest.main()