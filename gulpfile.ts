import {Gulpclass, SequenceTask} from "gulpclass/Decorators";
import "./gulp/DataFetcher";
import "./gulp/TopojsonConverter";

@Gulpclass()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Gulpfile {
    @SequenceTask("default")
    public default(): string[] {
        return ["fetch"];
    }
}
