import {Gulpclass, SequenceTask} from "gulpclass/Decorators";
import "./gulp/fetch/index.ts";

@Gulpclass()
class Gulpfile {
    @SequenceTask("default")
    public default(): string[] {
        return ["fetch"];
    }
}
