#!/bin/bash

# 获取参数
DMG_PATH=$1

if [ -z "$DMG_PATH" ]; then
  echo "错误: 必须指定DMG文件路径"
  echo "用法: ./notarize.sh <dmg文件路径>"
  exit 1
fi

# 检查文件是否存在
if [ ! -f "$DMG_PATH" ]; then
  echo "错误: 文件不存在: $DMG_PATH"
  exit 1
fi

# 执行公证
echo "开始公证: $DMG_PATH"
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "XXX" \
  --password "XXX" \
  --team-id "xxx" \
  --wait

# 检查公证结果
if [ $? -eq 0 ]; then
  echo "公证成功完成!"
else
  echo "公证失败!"
  exit 1
fi 