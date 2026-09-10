import Foundation
import Vision
import ImageIO

struct Detection: Codable {
    let path: String
    let faceCount: Int
    let largestFaceArea: Double
    let totalFaceArea: Double
    let bestFaceQuality: Double?
    let bestFaceConfidence: Double?
}

func image(for path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let source = CGImageSourceCreateWithURL(url, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]

for path in CommandLine.arguments.dropFirst() {
    guard let cgImage = image(for: path) else {
        let result = Detection(path: path, faceCount: 0, largestFaceArea: 0, totalFaceArea: 0, bestFaceQuality: nil, bestFaceConfidence: nil)
        print(String(data: try encoder.encode(result), encoding: .utf8)!)
        continue
    }

    let request = VNDetectFaceCaptureQualityRequest()
    try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
    let faces = request.results ?? []
    let areas = faces.map { Double($0.boundingBox.width * $0.boundingBox.height) }
    let ranked = faces.sorted(by: { (left: VNFaceObservation, right: VNFaceObservation) in
        (left.faceCaptureQuality ?? 0) > (right.faceCaptureQuality ?? 0)
    })
    let best = ranked.first

    let result = Detection(
        path: path,
        faceCount: faces.count,
        largestFaceArea: areas.max() ?? 0,
        totalFaceArea: areas.reduce(0, +),
        bestFaceQuality: best.map { Double($0.faceCaptureQuality ?? 0) },
        bestFaceConfidence: best.map { Double($0.confidence) }
    )
    print(String(data: try encoder.encode(result), encoding: .utf8)!)
}
