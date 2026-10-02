cmake_minimum_required(VERSION 3.16)
project(DocumentIntelligenceEngineQt VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 REQUIRED COMPONENTS Core)

include_directories(
    ../../crates/document-intelligence-c-abi/include
)

add_library(DocumentIntelligenceEngineQt STATIC
    die_qt.hpp
    die_qt.cpp
)

target_link_libraries(DocumentIntelligenceEngineQt
    PUBLIC
        Qt6::Core
)
