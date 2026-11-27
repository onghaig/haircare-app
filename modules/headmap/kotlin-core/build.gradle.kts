// The pure-Kotlin HeadMap core: the same quality checks, hair coverage, hairline measurement and
// capture gate as the Swift core (../core), with the same tests and reference fixtures. Runs on
// any JVM (`gradle test` here); the Android module compiles these sources in directly.
plugins {
  kotlin("jvm") version "2.1.20"
}

repositories { mavenCentral() }

dependencies {
  testImplementation(kotlin("test"))
  testImplementation("org.json:json:20240303")
}


sourceSets {
  test { resources.srcDir("../core/Tests/HeadMapCoreTests") }
}

tasks.test {
  useJUnitPlatform()
  testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
