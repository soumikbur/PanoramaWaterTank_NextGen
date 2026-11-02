import os

orig_path = r'C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank-Milestone2\PanoramaWaterTank\qml\pages\AlertsPage.qml'
dest_path = r'C:\Users\User\Documents\Antigravity_soumik\PanoramaWaterTank_NextGen\qml\pages\AlertsPage.qml'

with open(orig_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    # Check if we hit the anchor section around line 580
    if 575 <= i <= 625:
        if 'Item {' in line and 'Layout.preferredWidth: 90' in lines[i+1]:
            # Replace with Rectangle
            new_lines.append('                                Rectangle {\n')
            new_lines.append('                                    Layout.preferredWidth: 90\n')
            new_lines.append('                                    Layout.alignment: Qt.AlignVCenter\n')
            new_lines.append('                                    height: 22\n')
            new_lines.append('                                    width: hSevText.implicitWidth + 14\n')
            new_lines.append('                                    radius: 11\n')
            new_lines.append('                                    color: modelData.severity === "CRITICAL" ? "#FEE2E2" : (modelData.severity === "WARNING" ? "#FEF3C7" : "#ECFDF5")\n')
            new_lines.append('\n')
            new_lines.append('                                    Text {\n')
            new_lines.append('                                        id: hSevText\n')
            new_lines.append('                                        anchors.centerIn: parent\n')
            new_lines.append('                                        text: modelData.severity || "NORMAL"\n')
            new_lines.append('                                        color: modelData.severity === "CRITICAL" ? "#991B1B" : (modelData.severity === "WARNING" ? "#92400E" : "#065F46")\n')
            new_lines.append('                                        font.pixelSize: 10\n')
            new_lines.append('                                        font.weight: Font.Bold\n')
            new_lines.append('                                    }\n')
            new_lines.append('                                }\n')
            skip_count = 19
            continue
        elif 'Item {' in line and 'Layout.fillWidth: true' in lines[i+1]:
            # Replace with direct Text
            new_lines.append('                                Text {\n')
            new_lines.append('                                    Layout.fillWidth: true\n')
            new_lines.append('                                    Layout.alignment: Qt.AlignVCenter\n')
            new_lines.append('                                    text: modelData.status || "--"\n')
            new_lines.append('                                    color: modelData.status === "Active" ? "#DC2626" : (modelData.status === "Acknowledged" ? "#3B82F6" : "#059669")\n')
            new_lines.append('                                    font.pixelSize: 12\n')
            new_lines.append('                                    font.weight: Font.Bold\n')
            new_lines.append('                                    font.family: Theme.typography.fontFamily\n')
            new_lines.append('                                }\n')
            skip_count = 11
            continue
    if 'skip_count' in locals() and skip_count > 0:
        skip_count -= 1
        continue
    new_lines.append(line)

with open(dest_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"AlertsPage.qml fixed and written successfully: {len(new_lines)} lines.")

